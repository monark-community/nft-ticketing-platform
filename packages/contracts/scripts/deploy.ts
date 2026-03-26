import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    const TicketNFT = await ethers.getContractFactory("TicketNFT");
    
    const contract = await upgrades.deployProxy(TicketNFT, [deployer.address], {
        initializer: "initialize",
        unsafeAllow: ["constructor"],
    });

    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log("TicketNFT deployed to:", address);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});