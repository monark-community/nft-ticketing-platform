import { ethers, upgrades, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    console.log("Deploying contracts with admin account:", deployer.address);

    // Deploy MockUSDC contract first
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    const usdcAddress = await mockUsdc.getAddress();
    console.log("MockUSDC deployed to:", usdcAddress);

    // Deploy TicketNFT contract with the address of the deployed MockUSDC
    const TicketNFT = await ethers.getContractFactory("TicketNFT");
    
    // Deploy the TicketNFT contract with the deployer's address and the MockUSDC address
    const contract = await upgrades.deployProxy(TicketNFT, [deployer.address, usdcAddress], {
        initializer: "initialize",
        kind: "uups",
    });

    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log("TicketNFT deployed to:", address);

    // The block the proxy was deployed in: the API's listener reads the contract's events from here
    // (CONTRACT_DEPLOY_BLOCK, #242). Its initialize() runs in the same transaction.
    const receipt = await contract.deploymentTransaction()?.wait();
    if (!receipt) throw new Error("Could not read the TicketNFT deployment transaction");
    const deployBlock = receipt.blockNumber;
    console.log("TicketNFT deploy block:", deployBlock);

    // Grant the ORGANIZER_ROLE to the second signer if available
    if (signers.length > 1) {
        const organizer = signers[1];
        const organizerRole = await contract.ORGANIZER_ROLE();
        const grantTx = await contract.grantRole(organizerRole, organizer.address);
        await grantTx.wait();
        console.log(`Organizer role granted to: ${organizer.address}`);
    } else {
        console.log("No organizer account available to grant role.");
        
    }

    // Export the ABI and addresses to the frontend
    await exportToFrontend(address, usdcAddress, deployBlock);
}

async function exportToFrontend(ticketNFTAddress: string, usdcAddress: string, deployBlock: number) {
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

            // Export the addresses to a JSON file
            const currentNetwork = await ethers.provider.getNetwork();
            const addresses = {
                TicketNFT: ticketNFTAddress,
                MockUSDC: usdcAddress,
                deployBlock,
                network: network.name,
                chainId: Number(currentNetwork.chainId),
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


main().catch((error) => {
    console.error(error);
    process.exit(1);
});