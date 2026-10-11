import { expect } from "chai";
import { ethers } from "hardhat";
import { deployTicketNFT, setupEvent } from "./helpers";

describe("TicketNFT - Role-Based Access Control", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, scanner: any, hacker: any;

    beforeEach(async function () {
        [admin, organizer, scanner, hacker] = await ethers.getSigners();
        ({ ticketNFT } = await deployTicketNFT(admin));
    });

    it("Should have correctly defined roles", async function () {
        const ORGANIZER_ROLE = ethers.id("ORGANIZER_ROLE");
        expect(await ticketNFT.ORGANIZER_ROLE()).to.equal(ORGANIZER_ROLE);
    });

    it("Should allow admin to grant roles", async function () {
        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        expect(await ticketNFT.hasRole(ORGANIZER_ROLE, organizer.address)).to.be.true;
    });

    it("Should restrict ticket issuance to organizers only and reject hackers", async function () {
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
        await setupEvent(ticketNFT, organizer, 1);

        await ticketNFT.connect(organizer).issueTickets(1, 0, [admin.address]);

        await expect(
            ticketNFT.connect(hacker).issueTickets(1, 0, [hacker.address])
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("Should restrict check-in to event scanners and reject hackers", async function () {
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
        await setupEvent(ticketNFT, organizer, 1);
        await ticketNFT.connect(organizer).issueTickets(1, 0, [admin.address]);
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);

        await expect(ticketNFT.connect(hacker).checkInTicket(0)).to.be.revertedWith("Not authorized to check in");

        await expect(ticketNFT.connect(scanner).checkInTicket(0))
            .to.emit(ticketNFT, "TicketCheckedIn")
            .withArgs(0, scanner.address);

        expect(await ticketNFT.isUsed(0)).to.be.true;
    });

    it("Should allow Admin and Organizer to check in tickets", async function () {
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
        await setupEvent(ticketNFT, organizer, 1);
        await ticketNFT.connect(organizer).issueTickets(1, 0, [admin.address, admin.address]);

        await expect(ticketNFT.connect(organizer).checkInTicket(0))
            .to.emit(ticketNFT, "TicketCheckedIn")
            .withArgs(0, organizer.address);
        await expect(ticketNFT.connect(admin).checkInTicket(1))
            .to.emit(ticketNFT, "TicketCheckedIn")
            .withArgs(1, admin.address);
    });

    it("Should prevent double check-ins", async function () {
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
        await setupEvent(ticketNFT, organizer, 1);
        await ticketNFT.connect(organizer).issueTickets(1, 0, [admin.address]);

        await ticketNFT.connect(organizer).checkInTicket(0);
        await expect(ticketNFT.connect(organizer).checkInTicket(0))
            .to.be.revertedWith("Ticket already used");
    });

    it("Should revert when checking in a non-existent ticket", async function () {
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);

        await expect(ticketNFT.connect(scanner).checkInTicket(999)).to.be.reverted;
    });

    it("Should correctly report ticket validity (isValidTicket)", async function () {
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
        await setupEvent(ticketNFT, organizer, 1);

        expect(await ticketNFT.isValidTicket(999)).to.be.false;

        await ticketNFT.connect(organizer).issueTickets(1, 0, [admin.address]);
        expect(await ticketNFT.isValidTicket(0)).to.be.true;

        await ticketNFT.connect(organizer).checkInTicket(0);
        expect(await ticketNFT.isValidTicket(0)).to.be.false;
    });
});
