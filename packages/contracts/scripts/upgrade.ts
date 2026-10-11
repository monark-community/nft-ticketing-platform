import { ethers, upgrades } from "hardhat";

// Upgrades an already-deployed TicketNFT proxy to the current TicketNFT code.
// Usage (from packages/contracts):
//   macOS/Linux:  PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade.ts --network localhost
//   PowerShell:   $env:PROXY_ADDRESS="0x..."; npx hardhat run scripts/upgrade.ts --network localhost
async function main() {
    const proxyAddress = process.env.PROXY_ADDRESS;
    if (!proxyAddress) {
        throw new Error("Set PROXY_ADDRESS to the deployed TicketNFT proxy address");
    }

    const [deployer] = await ethers.getSigners();
    console.log("Upgrading with account:", deployer.address);

    const current = await ethers.getContractAt("TicketNFT", proxyAddress);
    if (await current.upgradesLocked()) {
        throw new Error("Upgrades are permanently locked on this contract; it can no longer be upgraded.");
    }

    const NewImplementation = await ethers.getContractFactory("TicketNFT");

    console.log("Checking storage layout compatibility...");
    await upgrades.validateUpgrade(proxyAddress, NewImplementation);

    const upgraded = await upgrades.upgradeProxy(proxyAddress, NewImplementation);
    await upgraded.waitForDeployment();

    console.log("Proxy address (unchanged):", proxyAddress);
    console.log(
        "New implementation address:",
        await upgrades.erc1967.getImplementationAddress(proxyAddress)
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});