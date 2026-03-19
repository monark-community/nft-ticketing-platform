import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

// Tests for TicketNFT focusing on role-based access control and security
describe("TicketNFT Security - Role Access", function (){
    it("Should reject minint attempts from an unauthorized address", async function () {
        const [admin, organizer, hacker] = await ethers.getSigners();

        const TicketNFT = await ethers.getContractFactory("TicketNFT");
        const ticketNFT = await upgrades.deployProxy(TicketNFT, [admin.address], { kind: "uups" });

        const ORGANIZER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ORGANIZER_ROLE"));
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);

        await expect(
            ticketNFT.connect(hacker).mintTicket(hacker.address, 1, "ipfs://test", 0)
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");

        console.log("Unauthorized minting attempt correctly rejected");
    })
})