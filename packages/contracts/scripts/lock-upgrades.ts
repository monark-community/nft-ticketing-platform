import { ethers } from "hardhat";

// PERMANENTLY disables upgrades on a deployed TicketNFT proxy. This cannot be undone.
// Run this before any public sale (Monark's requirement: purchased tickets have fixed conditions).
// Requires CONFIRM=yes as a safety check.
// Usage (from packages/contracts):
//   macOS/Linux:  PROXY_ADDRESS=0x... CONFIRM=yes npx hardhat run scripts/lock-upgrades.ts --network <network>
//   PowerShell:   $env:PROXY_ADDRESS="0x..."; $env:CONFIRM="yes"; npx hardhat run scripts/lock-upgrades.ts --network <network>
async function main() {
    const proxyAddress = process.env.PROXY_ADDRESS;
    if (!proxyAddress) throw new Error("Set PROXY_ADDRESS to the deployed TicketNFT proxy address");
    if (process.env.CONFIRM !== "yes") {
        throw new Error("This is irreversible. Re-run with CONFIRM=yes to lock upgrades permanently.");
    }

    const ticketNFT = await ethers.getContractAt("TicketNFT", proxyAddress);
    if (await ticketNFT.upgradesLocked()) {
        console.log("Upgrades are already locked.");
        return;
    }

    const tx = await ticketNFT.lockUpgrades();
    await tx.wait();
    console.log("Upgrades permanently locked. Transaction:", tx.hash);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});