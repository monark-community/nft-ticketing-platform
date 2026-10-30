// Local dev seed (#40): sets up buyable events on the local Hardhat node so the
// event page, My Tickets and the scanner can be tested end to end.
//
// Run order (see the README "Local test data" section):
//   1. npx hardhat node
//   2. npx hardhat run scripts/deploy.ts --network localhost
//   3. cd services/api && npm run db:seed   (the events must exist in the database first)
//   4. start the API, so the listener saves the purchases below
//   5. npx hardhat run scripts/seed.ts --network localhost
//
// Uses Hardhat's default test accounts. Their private keys are public: local use only.
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Must match services/api/prisma/seed.ts
const GALA_EVENT_ID = 1;
const PRESALE_EVENT_ID = 2;
const DAY = 24 * 60 * 60;

const usdc = (amount: number) => ethers.parseUnits(amount.toString(), 6);

// Same tiers, in the same order, as the database seed (order = on-chain type ID until #216)
const TIERS = [
  { name: "General Admission", price: 15, supply: 1000 },
  { name: "VIP", price: 28, supply: 300 },
  { name: "Early Bird", price: 10, supply: 2 }, // tiny supply so it sells out below
];

async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error(`The dev seed only runs on a local node, not on "${network.name}".`);
  }

  const [admin, organizer, attendee, attendee2, scanner] = await ethers.getSigners();

  const addressesPath = path.resolve(__dirname, "../../..", "services", "web", "src", "contracts", "addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
  const ticketNft = await ethers.getContractAt("TicketNFT", addresses.TicketNFT);
  const mockUsdc = await ethers.getContractAt("MockUSDC", addresses.MockUSDC);

  // Running it twice would fail once tickets are sold (the event terms lock), so stop early
  if ((await ticketNft.eventConfigs(GALA_EVENT_ID)).configured) {
    console.log("Already seeded. Restart `npx hardhat node` and deploy again for a fresh chain.");
    return;
  }

  const latest = await ethers.provider.getBlock("latest");
  const now = latest!.timestamp;
  const asOrganizer = ticketNft.connect(organizer);

  // Event 1: Gala Opera Concert, public sale, 10% royalty, 2x resale cap, 4 tickets per wallet
  await setUpEvent(asOrganizer, GALA_EVENT_ID, now + 30 * DAY, "gala");
  await (await asOrganizer.setSaleActive(GALA_EVENT_ID, true)).wait();
  await (await asOrganizer.setEventScanner(GALA_EVENT_ID, scanner.address, true)).wait();

  // Event 2: Jazz at the Atrium, presale with only the first attendee on the guest list
  await setUpEvent(asOrganizer, PRESALE_EVENT_ID, now + 45 * DAY, "jazz");
  await (await asOrganizer.setPresaleActive(PRESALE_EVENT_ID, true)).wait();
  await (await asOrganizer.addToWhitelist(PRESALE_EVENT_ID, attendee.address)).wait();
  await (await asOrganizer.setSaleActive(PRESALE_EVENT_ID, true)).wait();

  // Test USDC for both attendees
  for (const wallet of [attendee, attendee2]) {
    await (await mockUsdc.mint(wallet.address, usdc(1000))).wait();
  }

  // The first attendee buys 2 General Admission and both Early Bird tickets, so
  // My Tickets has data and Early Bird shows as sold out
  await (await mockUsdc.connect(attendee).approve(addresses.TicketNFT, usdc(50))).wait();
  await (await ticketNft.connect(attendee).buyTickets(GALA_EVENT_ID, 0, 2)).wait();
  await (await ticketNft.connect(attendee).buyTickets(GALA_EVENT_ID, 2, 2)).wait();

  console.log("\nDev seed done");
  console.log(`  TicketNFT   ${addresses.TicketNFT}`);
  console.log(`  MockUSDC    ${addresses.MockUSDC}`);
  console.log(`  Admin       #0 ${admin.address}`);
  console.log(`  Organizer   #1 ${organizer.address}`);
  console.log(`  Attendee    #2 ${attendee.address}  1000 USDC, owns tokens 0-1 (General Admission) and 2-3 (Early Bird)`);
  console.log(`  Attendee    #3 ${attendee2.address}  1000 USDC, no tickets, not on the presale guest list`);
  console.log(`  Scanner     #4 ${scanner.address}  can check in event ${GALA_EVENT_ID}`);
  console.log(`  Event ${GALA_EVENT_ID}     Gala Opera Concert, public sale, Early Bird sold out`);
  console.log(`  Event ${PRESALE_EVENT_ID}     Jazz at the Atrium, presale, only #2 on the guest list`);
}

async function setUpEvent(asOrganizer: any, eventId: number, endTime: number, slug: string) {
  await (await asOrganizer.configureEvent(eventId, endTime, 1000, 20000, 4)).wait();
  for (const tier of TIERS) {
    const uri = `ipfs://dev-seed/${slug}-${tier.name.toLowerCase().replace(/ /g, "-")}`;
    await (await asOrganizer.addTicketType(eventId, usdc(tier.price), tier.supply, uri)).wait();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
