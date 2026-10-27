import { expect } from "chai";
import { ethers } from "hardhat";
import { deployTicketNFT, setupEvent } from "./helpers";

const NOT_ALLOWED = "Not the event organizer or admin";

describe("TicketNFT - Event-scoped permissions (#208)", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, otherOrganizer: any, hacker: any, scanner: any, user: any;

    beforeEach(async function () {
        [admin, organizer, otherOrganizer, hacker, scanner, user] = await ethers.getSigners();
        ({ ticketNFT } = await deployTicketNFT(admin));
        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        await ticketNFT.grantRole(ORGANIZER_ROLE, otherOrganizer.address);
        await setupEvent(ticketNFT, organizer, 1);
    });

    // Every event-management action, run on event 1
    const actions: Record<string, (contract: any, wallet: string) => Promise<any>> = {
        issueTickets: (c, w) => c.issueTickets(1, 0, [w]),
        setPresaleActive: (c) => c.setPresaleActive(1, true),
        addToWhitelist: (c, w) => c.addToWhitelist(1, w),
        batchAddToWhitelist: (c, w) => c.batchAddToWhitelist(1, [w]),
        removeFromWhitelist: (c, w) => c.removeFromWhitelist(1, w),
        setEventScanner: (c, w) => c.setEventScanner(1, w, true),
    };

    for (const [name, call] of Object.entries(actions)) {
        describe(name, function () {
            it("lets the event's organizer do it", async function () {
                await expect(call(ticketNFT.connect(organizer), user.address)).to.not.be.reverted;
            });

            it("lets the admin do it", async function () {
                await expect(call(ticketNFT.connect(admin), user.address)).to.not.be.reverted;
            });

            it("rejects another event's organizer", async function () {
                await expect(call(ticketNFT.connect(otherOrganizer), user.address)).to.be.revertedWith(NOT_ALLOWED);
            });

            it("rejects an account without a role", async function () {
                await expect(call(ticketNFT.connect(hacker), user.address)).to.be.revertedWith(NOT_ALLOWED);
            });

            it("rejects the organizer once their role is revoked", async function () {
                await ticketNFT.revokeRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
                await expect(call(ticketNFT.connect(organizer), user.address)).to.be.revertedWith(NOT_ALLOWED);
            });
        });
    }

    it("rejects an organizer managing an event they haven't configured", async function () {
        await expect(ticketNFT.connect(organizer).addToWhitelist(2, user.address)).to.be.revertedWith(NOT_ALLOWED);
    });

    describe("checkInTicket", function () {
        beforeEach(async function () {
            await ticketNFT.connect(organizer).issueTickets(1, 0, [user.address]); // token 0
        });

        it("lets the event's organizer check in", async function () {
            await expect(ticketNFT.connect(organizer).checkInTicket(0))
                .to.emit(ticketNFT, "TicketCheckedIn").withArgs(0, organizer.address);
        });

        it("lets the admin check in", async function () {
            await expect(ticketNFT.connect(admin).checkInTicket(0))
                .to.emit(ticketNFT, "TicketCheckedIn").withArgs(0, admin.address);
        });

        it("lets the event's scanner check in", async function () {
            await ticketNFT.connect(organizer).setEventScanner(1, scanner.address, true);
            await expect(ticketNFT.connect(scanner).checkInTicket(0))
                .to.emit(ticketNFT, "TicketCheckedIn").withArgs(0, scanner.address);
        });

        it("rejects another event's organizer", async function () {
            await expect(ticketNFT.connect(otherOrganizer).checkInTicket(0))
                .to.be.revertedWith("Not authorized to check in");
        });
    });
});
