import { expect } from "chai";
import { ethers } from "hardhat";
import { deployTicketNFT, setupEvent } from "./helpers";

describe("TicketNFT - Organizer-Issued Tickets", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, otherOrganizer: any, hacker: any, user1: any, user2: any, user3: any;

    beforeEach(async function () {
        [admin, organizer, otherOrganizer, hacker, user1, user2, user3] = await ethers.getSigners();
        ({ ticketNFT } = await deployTicketNFT(admin));

        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        await ticketNFT.grantRole(ORGANIZER_ROLE, otherOrganizer.address);

        await setupEvent(ticketNFT, organizer, 1, { price: 50n, maxSupply: 5 });
    });

    it("Should issue tickets to multiple recipients", async function () {
        await ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address, user2.address, user3.address]);

        expect(await ticketNFT.ownerOf(0)).to.equal(user1.address);
        expect(await ticketNFT.ownerOf(1)).to.equal(user2.address);
        expect(await ticketNFT.ownerOf(2)).to.equal(user3.address);
    });

    it("Should emit TicketMinted with the ticket type for each token", async function () {
        await expect(ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address, user2.address]))
            .to.emit(ticketNFT, "TicketMinted").withArgs(0, 1, 0, user1.address, "ipfs://event-1-type-0")
            .and.to.emit(ticketNFT, "TicketMinted").withArgs(1, 1, 0, user2.address, "ipfs://event-1-type-0");
    });

    it("Should record the event, ticket type, face value and token URI", async function () {
        await ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address]);

        expect(await ticketNFT.tokenEventId(0)).to.equal(1);
        expect(await ticketNFT.tokenTicketType(0)).to.equal(0);
        expect(await ticketNFT.tokenFaceValue(0)).to.equal(50);
        expect(await ticketNFT.tokenURI(0)).to.equal("ipfs://event-1-type-0");
    });

    it("Should count issued tickets toward the ticket type's supply", async function () {
        await ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address, user1.address, user1.address]);
        expect((await ticketNFT.ticketTypes(1, 0)).issued).to.equal(3);

        await expect(
            ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address, user1.address, user1.address])
        ).to.be.revertedWith("Not enough tickets left");
        await ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address, user1.address]);
    });

    it("Should reject accounts without the organizer role", async function () {
        await expect(
            ticketNFT.connect(hacker).issueTickets(1, 0, [user1.address])
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("Should reject another organizer issuing tickets for this event", async function () {
        await expect(
            ticketNFT.connect(otherOrganizer).issueTickets(1, 0, [user1.address])
        ).to.be.revertedWith("Not the event organizer");
    });

    it("Should revert for a ticket type that does not exist", async function () {
        await expect(
            ticketNFT.connect(organizer).issueTickets(1, 1, [user1.address])
        ).to.be.revertedWith("Ticket type does not exist");
    });

    it("Should revert if no recipients are given", async function () {
        await expect(
            ticketNFT.connect(organizer).issueTickets(1, 0, [])
        ).to.be.revertedWith("Must issue at least one ticket");
    });

    it("Should revert if more than 100 recipients are given", async function () {
        await ticketNFT.connect(organizer).updateTicketType(1, 0, 50n, 200, "ipfs://event-1-type-0");
        await expect(
            ticketNFT.connect(organizer).issueTickets(1, 0, Array(101).fill(user1.address))
        ).to.be.revertedWith("Batch size cannot exceed 100");
    });

    it("Should not apply the presale whitelist to issued tickets", async function () {
        await ticketNFT.connect(organizer).setPresaleActive(1, true);
        await ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address]);
        expect(await ticketNFT.ownerOf(0)).to.equal(user1.address);
    });

    it("Should not lock the event's terms", async function () {
        await ticketNFT.connect(organizer).issueTickets(1, 0, [user1.address]);
        await ticketNFT.connect(organizer).configureEvent(1, (await ticketNFT.eventConfigs(1)).endTime, 500, 11000, 0);
        await ticketNFT.connect(organizer).updateTicketType(1, 0, 75n, 5, "ipfs://event-1-type-0-v2");
        expect((await ticketNFT.ticketTypes(1, 0)).price).to.equal(75);
    });
});
