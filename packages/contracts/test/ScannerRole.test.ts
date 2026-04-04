import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Grant Scanner Role", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, scanner: any, hacker: any;

    beforeEach(async function () {
        [admin, organizer, scanner, hacker] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const mockUSDC = await MockUSDC.deploy();

        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        ticketNFT = await upgrades.deployProxy(
            TicketNFTFactory,
            [admin.address, await mockUSDC.getAddress()],
            { kind: "uups" }
        );

        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
    });

    it("Should allow organizer to grant scanner role", async function () {
        await ticketNFT.connect(organizer).grantScannerRole(1, scanner.address);
        const SCANNER_ROLE = await ticketNFT.SCANNER_ROLE();
        expect(await ticketNFT.hasRole(SCANNER_ROLE, scanner.address)).to.be.true;
    });

    it("Should emit ScannerUpdated event", async function () {
        await expect(ticketNFT.connect(organizer).grantScannerRole(1, scanner.address))
            .to.emit(ticketNFT, "ScannerUpdated")
            .withArgs(1, scanner.address);
    });

    it("Should reject hacker from granting scanner role", async function () {
        await expect(
            ticketNFT.connect(hacker).grantScannerRole(1, scanner.address)
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("Should allow scanner to check in after role is granted", async function () {
        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test", 1, 0);
        await ticketNFT.connect(organizer).grantScannerRole(1, scanner.address);

        await expect(ticketNFT.connect(scanner).checkInTicket(0))
            .to.emit(ticketNFT, "TicketCheckedIn")
            .withArgs(0, scanner.address);
    });
});