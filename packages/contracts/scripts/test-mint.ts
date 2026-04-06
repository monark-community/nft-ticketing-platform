import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    const TicketNFT = await ethers.getContractFactory("TicketNFT");
    const contract = await upgrades.deployProxy(TicketNFT, [deployer.address], {
        initializer: "initialize"
    });
    await contract.waitForDeployment();

    const ORGANIZER_ROLE = await contract.ORGANIZER_ROLE();
    await contract.grantRole(ORGANIZER_ROLE, deployer.address);

    const tx = await contract.mintTicket(
        deployer.address,
        "ipfs://QmTest123/ticket-metadata.json",
        1,
        0
    );
    await tx.wait();

    const owner = await contract.ownerOf(0);
    console.log("Ticket minted successfully!");
    console.log("Owner of token 0:", owner);
    console.log("Matches deployer:", owner === deployer.address);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});