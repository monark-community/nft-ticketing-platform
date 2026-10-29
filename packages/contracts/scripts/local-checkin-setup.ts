// LOCAL TESTING ONLY. Do not commit.
// Deploys MockUSDC + TicketNFT to a running Hardhat node and mints test tickets
// to your MetaMask address so you can test My Tickets / QR generation.
//
// Usage (from packages/contracts, with `npx hardhat node` running in another terminal):
//   ATTENDEE_ADDRESS=0xYourMetaMaskAddress npx hardhat run scripts/local-checkin-setup.ts --network localhost

import { ethers, upgrades } from "hardhat";

async function main() {
  const attendee = process.env.ATTENDEE_ADDRESS;
  if (!attendee || !ethers.isAddress(attendee)) {
    throw new Error("Set ATTENDEE_ADDRESS to your MetaMask address");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. Mock USDC (TicketNFT.initialize needs a USDC address)
  const usdc = await ethers.deployContract("MockUSDC");
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC:", usdcAddress);

  // 2. TicketNFT behind a UUPS proxy, with both initializer arguments
  const TicketNFT = await ethers.getContractFactory("TicketNFT");
  const ticket = await upgrades.deployProxy(TicketNFT, [deployer.address, usdcAddress], {
    initializer: "initialize",
    kind: "uups",
  });
  await ticket.waitForDeployment();
  const ticketAddress = await ticket.getAddress();

  // 3. Let the deployer mint
  const ORGANIZER_ROLE = await ticket.ORGANIZER_ROLE();
  await (await ticket.grantRole(ORGANIZER_ROLE, deployer.address)).wait();

  // 4. Mint two tickets for event 1 to the attendee
  const eventId = 1;
  for (let i = 0; i < 2; i++) {
    await (await ticket.mintTicket(attendee, `ipfs://test-ticket-${i}`, eventId, 0)).wait();
  }

  console.log("\nTicketNFT (proxy):", ticketAddress);
  console.log(`Minted 2 tickets for event ${eventId} to ${attendee}`);
  console.log("\nAdd this to services/web/.env.local:");
  console.log(`NEXT_PUBLIC_TICKET_CONTRACT_ADDRESS=${ticketAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
