import { ethers, upgrades } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    const usdcAddress = await mockUsdc.getAddress();

    const TicketNFT = await ethers.getContractFactory("TicketNFT");
    const contract = await upgrades.deployProxy(TicketNFT, [deployer.address, usdcAddress], {
        initializer: "initialize",
        kind: "uups",
    });
    await contract.waitForDeployment();

    const ORGANIZER_ROLE = await contract.ORGANIZER_ROLE();
    await contract.grantRole(ORGANIZER_ROLE, deployer.address);

    // Event 1: ends in 30 days, 5% royalty, resale cap 110% of face value, max 4 tickets per wallet
    const endTime = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    await (await contract.configureEvent(1, endTime, 500, 11000, 4)).wait();
    // Ticket type 0: free, 100 tickets
    await (await contract.addTicketType(1, 0, 100, "ipfs://QmTest123/ticket-metadata.json")).wait();

    const tx = await contract.issueTickets(1, 0, [deployer.address]);
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