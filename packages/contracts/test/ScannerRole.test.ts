import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Event Scanner", function () {
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

    it("Should allow organizer to set event scanner", async function () {
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);
        expect(await ticketNFT.eventScanners(1, scanner.address)).to.be.true;
    });

    it("Should emit ScannerUpdated event", async function () {
        await expect(ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true))
            .to.emit(ticketNFT, "ScannerUpdated")
            .withArgs(1, scanner.address, true);
    });

    it("Should reject hacker from setting event scanner", async function () {
        await expect(
            ticketNFT.connect(hacker).setEventScanner(1, scanner.address, true)
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("Should allow scanner to check in after being assigned to event", async function () {
        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test", 1, 0);
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);

        await expect(ticketNFT.connect(scanner).checkInTicket(0))
            .to.emit(ticketNFT, "TicketCheckedIn")
            .withArgs(0, scanner.address);
    });

    it("Should not allow scanner assigned to event 1 to check in event 2 ticket", async function () {
        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test", 2, 0);
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);

        await expect(
            ticketNFT.connect(scanner).checkInTicket(0)
        ).to.be.revertedWith("Not authorized to check in");
    });

    it("Should allow organizer to revoke event scanner", async function () {
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, false);
        expect(await ticketNFT.eventScanners(1, scanner.address)).to.be.false;
    });
});