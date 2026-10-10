import { expect } from "chai";
import { ethers } from "hardhat";
import { deployTicketNFT, setupEvent } from "./helpers";

describe("TicketNFT - Event Scanner", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, scanner: any, hacker: any;

    beforeEach(async function () {
        [admin, organizer, scanner, hacker] = await ethers.getSigners();
        ({ ticketNFT } = await deployTicketNFT(admin));
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
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
        await setupEvent(ticketNFT, organizer, 1);
        await ticketNFT.connect(organizer).issueTickets(1, 0, [admin.address]);
        await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);

        await expect(ticketNFT.connect(scanner).checkInTicket(0))
            .to.emit(ticketNFT, "TicketCheckedIn")
            .withArgs(0, scanner.address);
    });

    it("Should not allow scanner assigned to event 1 to check in event 2 ticket", async function () {
        await setupEvent(ticketNFT, organizer, 2);
        await ticketNFT.connect(organizer).issueTickets(2, 0, [admin.address]);
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
