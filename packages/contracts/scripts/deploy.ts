import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const organizer = signers[1];

    console.log("Deploying contracts with admin account:", deployer.address);
    console.log("Organizer account:", organizer.address);

    // 1. On déploie d'abord le faux token USDC pour les tests locaux
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    const usdcAddress = await mockUsdc.getAddress();
    console.log("MockUSDC deployed to:", usdcAddress);

    // 2. On déploie le contrat TicketNFT avec les DEUX arguments
    const TicketNFT = await ethers.getContractFactory("TicketNFT");
    
    // Ajout de usdcAddress dans le tableau des arguments
    const contract = await upgrades.deployProxy(TicketNFT, [deployer.address, usdcAddress], {
        initializer: "initialize",
        kind: "uups",
    });

    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log("TicketNFT deployed to:", address);

    const organizerRole = await contract.ORGANIZER_ROLE();
    const grantTx = await contract.grantRole(organizerRole, organizer.address);
    await grantTx.wait();
    console.log(`Organizer role granted to: ${organizer.address}`);

    exportToFrontend(address, usdcAddress);

    function exportToFrontend(ticketNFTAddress: string, usdcAddress: string) {
        const targetDir = path.resolve(__dirname, "../../..", "services", "web", "src", "contracts");

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const artifactPath = path.resolve(__dirname, "../artifacts/contracts/TicketNFT.sol/TicketNFT.json");

        if (fs.existsSync(artifactPath)) {
            const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

            fs.writeFileSync(
                path.join(targetDir, "TicketNFT.json"),
                JSON.stringify(artifact.abi, null, 2)
            );

            const addresses = {
                TicketNFT: ticketNFTAddress,
                MockUSDC: usdcAddress,
                network: "localhost",
                chainId: 31337
            };

            fs.writeFileSync(
                path.join(targetDir, "addresses.json"),
                JSON.stringify(addresses, null, 2)
            );

            console.log("Contract ABI and addresses exported to frontend.");
        } else {
            console.error("Artifact not found. Make sure the contract is compiled.");
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});