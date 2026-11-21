// Mock data, chain side (see services/api/prisma/mock-data.ts): sets up the mock events on the
// local Hardhat node, then buys, checks in, lists and resells tickets. The API's listener saves
// all of it into the database, so the API must be running.
//
// `npm run dev:fresh` runs it unless you pass --bare. By hand, after scripts/seed.ts and the
// database side (cd services/api && npm run db:seed:mock):
//   npx hardhat run scripts/seed-mock.ts --network localhost
//
// Uses Hardhat's default test accounts. Their private keys are public: local use only.
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

import {
  ACCOUNTS,
  MOCK_CHECK_INS,
  MOCK_EVENTS,
  MOCK_ISSUED,
  MOCK_LISTINGS,
  MOCK_PURCHASES,
  MOCK_USDC,
  MOCK_WITHDRAWALS,
  dateOf,
  type Person,
} from "../../../services/api/prisma/mock-data";

// The contract only accepts an end time in the future, so a past event ends this long after the
// script starts: its tickets are bought first, then it shows as over everywhere ("Ticket sales
// have ended" on its page, collectible resale prices)
const PAST_EVENT_SALES_SECONDS = 2 * 60;

async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error(`The mock data only goes on a local node, not on "${network.name}".`);
  }

  const signers = await ethers.getSigners();
  for (const [person, account] of Object.entries(ACCOUNTS)) {
    if (signers[account.index]?.address.toLowerCase() !== account.wallet) {
      throw new Error(`Hardhat account #${account.index} isn't ${person}'s wallet in mock-data.ts. Is this a default Hardhat node?`);
    }
  }
  const as = (person: Person) => signers[ACCOUNTS[person].index];

  const addressesPath = path.resolve(__dirname, "../../..", "services", "web", "src", "contracts", "addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
  const ticketNft = await ethers.getContractAt("TicketNFT", addresses.TicketNFT);
  const mockUsdc = await ethers.getContractAt("MockUSDC", addresses.MockUSDC);
  const decimals = await mockUsdc.decimals();
  const usdc = (amount: number) => ethers.parseUnits(amount.toString(), decimals);
  const send = async (tx: Promise<{ wait: () => Promise<any> }>) => (await tx).wait();

  // Past events first, so their tickets are bought well before they end
  const chainEvents = MOCK_EVENTS.filter((event) => event.chain).sort((a, b) => Number(Boolean(b.chain!.past)) - Number(Boolean(a.chain!.past)));
  const bySlug = new Map(MOCK_EVENTS.map((event) => [event.slug, event]));
  const chainId = (slug: string) => {
    const id = bySlug.get(slug)?.chain?.id;
    if (!id) throw new Error(`No on-chain mock event "${slug}" in mock-data.ts`);
    return id;
  };

  if (!(await ticketNft.eventConfigs(1)).configured) {
    throw new Error("Run the dev seed first (scripts/seed.ts).");
  }
  if ((await ticketNft.eventConfigs(Math.min(...chainEvents.map((e) => e.chain!.id)))).configured) {
    console.log("The mock data is already on this chain. Restart `npx hardhat node` and deploy again for a fresh chain.");
    return;
  }

  // Organizers of the mock events who don't have the role yet (Marcus): the admin grants it,
  // and the listener approves their open request on the Admin page
  const organizerRole = await ticketNft.ORGANIZER_ROLE();
  for (const person of new Set(chainEvents.map((event) => event.organizer))) {
    if (!(await ticketNft.hasRole(organizerRole, ACCOUNTS[person].wallet))) {
      await send(ticketNft.connect(as("admin")).grantRole(organizerRole, ACCOUNTS[person].wallet));
    }
  }

  // Test USDC, and each buyer lets the contract take payments
  for (const [person, amount] of Object.entries(MOCK_USDC) as [Person, number][]) {
    await send(mockUsdc.mint(ACCOUNTS[person].wallet, usdc(amount)));
  }
  const buyers = new Set<Person>([...MOCK_PURCHASES.map((p) => p.buyer), ...MOCK_LISTINGS.flatMap((l) => (l.boughtBy ? [l.boughtBy] : []))]);
  for (const person of buyers) {
    await send(mockUsdc.connect(as(person)).approve(addresses.TicketNFT, ethers.MaxUint256));
  }

  // The events: terms, ticket types, scanners, guest list, then the sale opens
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  for (const event of chainEvents) {
    const chain = event.chain!;
    const organizer = ticketNft.connect(as(event.organizer));
    const endTime = chain.past ? now + PAST_EVENT_SALES_SECONDS : Math.floor(dateOf(event.end).getTime() / 1000);
    await send(organizer.configureEvent(chain.id, endTime, chain.royaltyBps, chain.resaleCapBps, chain.perWalletLimit));
    for (const tier of event.tiers) {
      const uri = `ipfs://dev-mock/${event.slug}-${tier.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      await send(organizer.addTicketType(chain.id, usdc(tier.price), tier.supply, uri));
    }
    for (const person of chain.scanners ?? []) {
      await send(organizer.setEventScanner(chain.id, ACCOUNTS[person].wallet, true));
    }
    if (chain.guestList?.length) {
      await send(organizer.setPresaleActive(chain.id, true));
      await send(organizer.batchAddToWhitelist(chain.id, chain.guestList.map((person) => ACCOUNTS[person].wallet)));
    }
    await send(organizer.setSaleActive(chain.id, true));
  }

  // Purchases: the token IDs each one minted, for the check-ins and listings
  const bought = new Map<string, bigint[]>();
  for (const purchase of MOCK_PURCHASES) {
    const receipt = await send(ticketNft.connect(as(purchase.buyer)).buyTickets(chainId(purchase.event), purchase.tier, purchase.quantity));
    bought.set(purchase.label, mintedTokens(ticketNft, receipt));
  }
  for (const issue of MOCK_ISSUED) {
    const event = bySlug.get(issue.event)!;
    await send(ticketNft.connect(as(event.organizer)).issueTickets(chainId(issue.event), issue.tier, issue.to.map((person) => ACCOUNTS[person].wallet)));
  }
  const tokenOf = (label: string, index: number) => {
    const token = bought.get(label)?.[index];
    if (token === undefined) throw new Error(`Purchase "${label}" has no ticket ${index}`);
    return token;
  };

  for (const checkIn of MOCK_CHECK_INS) {
    for (let i = 0; i < checkIn.count; i++) {
      await send(ticketNft.connect(as("sam")).checkInTicket(tokenOf(checkIn.purchase, i)));
    }
  }

  for (const listing of MOCK_LISTINGS) {
    const purchase = MOCK_PURCHASES.find((p) => p.label === listing.purchase)!;
    const token = tokenOf(listing.purchase, listing.ticket);
    await send(ticketNft.connect(as(purchase.buyer)).listForResale(token, usdc(listing.price)));
    if (listing.boughtBy) {
      await send(ticketNft.connect(as(listing.boughtBy)).buyResaleTicket(token, usdc(listing.price)));
    }
  }

  // An organizer takes out a past event's revenue
  for (const withdrawal of MOCK_WITHDRAWALS) {
    const event = bySlug.get(withdrawal.event)!;
    await send(ticketNft.connect(as(event.organizer)).withdraw(chainId(withdrawal.event)));
  }

  const tickets = [...bought.values()].reduce((sum, tokens) => sum + tokens.length, 0) + MOCK_ISSUED.reduce((sum, i) => sum + i.to.length, 0);
  console.log("\nMock data done");
  const ids = chainEvents.map((e) => e.chain!.id).sort((a, b) => a - b);
  console.log(`  Events      ${ids[0]} to ${ids[ids.length - 1]}: ${chainEvents.length} on the chain, ${chainEvents.filter((e) => e.chain!.past).length} of them over`);
  console.log(`  Tickets     ${tickets} sold or sent, ${MOCK_CHECK_INS.reduce((sum, c) => sum + c.count, 0)} checked in`);
  console.log(`  Marketplace ${MOCK_LISTINGS.filter((l) => !l.boughtBy).length} listings, ${MOCK_LISTINGS.filter((l) => l.boughtBy).length} resold`);
}

// Token IDs minted by a transaction, from its TicketMinted logs
function mintedTokens(ticketNft: { interface: { parseLog: (log: any) => any } }, receipt: { logs: any[] }): bigint[] {
  const tokens: bigint[] = [];
  for (const log of receipt.logs) {
    let parsed = null;
    try {
      parsed = ticketNft.interface.parseLog(log);
    } catch {
      // another contract's log (the USDC transfer)
    }
    if (parsed?.name === "TicketMinted") tokens.push(parsed.args.tokenId);
  }
  return tokens;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
