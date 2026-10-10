import { expect } from "chai";
import { ethers } from "hardhat";
import { deployTicketNFT, setupEvent } from "./helpers";

describe("TicketNFT - Per-Wallet Limit", function () {
    let ticketNFT: any, usdc: any;
    let admin: any, organizer: any, buyer: any, friend: any, seller: any;
    const LIMIT = 4;

    beforeEach(async function () {
        [admin, organizer, buyer, friend, seller] = await ethers.getSigners();
        ({ ticketNFT, usdc } = await deployTicketNFT(admin));
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);

        // Free tickets keep the focus on the limit; resale uses USDC
        await setupEvent(ticketNFT, organizer, 1, { perWalletLimit: LIMIT });
        await ticketNFT.connect(organizer).setSaleActive(1, true);

        await usdc.mint(buyer.address, ethers.parseUnits("1000", 6));
        await usdc.connect(buyer).approve(await ticketNFT.getAddress(), ethers.MaxUint256);
    });

    it("stores the limit in the event setup", async function () {
        expect((await ticketNFT.eventConfigs(1)).perWalletLimit).to.equal(LIMIT);
    });

    it("lets a wallet buy up to the limit, then rejects more", async function () {
        await ticketNFT.connect(buyer).buyTickets(1, 0, 3);
        await ticketNFT.connect(buyer).buyTickets(1, 0, 1);
        expect(await ticketNFT.eventTicketsHeld(1, buyer.address)).to.equal(4);

        await expect(ticketNFT.connect(buyer).buyTickets(1, 0, 1)).to.be.revertedWith("Per-wallet limit reached");
    });

    it("rejects a single purchase larger than the limit", async function () {
        await expect(ticketNFT.connect(buyer).buyTickets(1, 0, 5)).to.be.revertedWith("Per-wallet limit reached");
    });

    it("counts tickets received by plain transfer toward the limit", async function () {
        await ticketNFT.connect(friend).buyTickets(1, 0, 2);
        await ticketNFT.connect(friend).transferFrom(friend.address, buyer.address, 0);
        await ticketNFT.connect(friend).transferFrom(friend.address, buyer.address, 1);
        expect(await ticketNFT.eventTicketsHeld(1, buyer.address)).to.equal(2);

        await expect(ticketNFT.connect(buyer).buyTickets(1, 0, 3)).to.be.revertedWith("Per-wallet limit reached");
        await ticketNFT.connect(buyer).buyTickets(1, 0, 2);
    });

    it("never blocks plain transfers, even above the limit", async function () {
        await ticketNFT.connect(friend).buyTickets(1, 0, 4);
        await ticketNFT.connect(buyer).buyTickets(1, 0, 4);

        await ticketNFT.connect(friend).transferFrom(friend.address, buyer.address, 0);
        expect(await ticketNFT.eventTicketsHeld(1, buyer.address)).to.equal(5);
    });

    it("frees up room after transferring tickets away", async function () {
        await ticketNFT.connect(buyer).buyTickets(1, 0, 4);
        await ticketNFT.connect(buyer).transferFrom(buyer.address, friend.address, 0);
        expect(await ticketNFT.eventTicketsHeld(1, buyer.address)).to.equal(3);

        await ticketNFT.connect(buyer).buyTickets(1, 0, 1);
    });

    it("rejects a platform resale to a buyer who is at the limit", async function () {
        await ticketNFT.connect(buyer).buyTickets(1, 0, 4);
        await ticketNFT.connect(seller).buyTickets(1, 0, 1); // token 4

        await expect(
            ticketNFT.connect(seller).resell(4, buyer.address, 0)
        ).to.be.revertedWith("Per-wallet limit reached");
    });

    it("allows a platform resale to a buyer below the limit", async function () {
        await ticketNFT.connect(buyer).buyTickets(1, 0, 3);
        await ticketNFT.connect(seller).buyTickets(1, 0, 1); // token 3

        await ticketNFT.connect(seller).resell(3, buyer.address, 0);
        expect(await ticketNFT.eventTicketsHeld(1, buyer.address)).to.equal(4);
        expect(await ticketNFT.eventTicketsHeld(1, seller.address)).to.equal(0);
    });

    it("counts each event separately", async function () {
        await setupEvent(ticketNFT, organizer, 2, { perWalletLimit: 1 });
        await ticketNFT.connect(organizer).setSaleActive(2, true);

        await ticketNFT.connect(buyer).buyTickets(1, 0, 4);
        await ticketNFT.connect(buyer).buyTickets(2, 0, 1);
        expect(await ticketNFT.eventTicketsHeld(1, buyer.address)).to.equal(4);
        expect(await ticketNFT.eventTicketsHeld(2, buyer.address)).to.equal(1);
    });

    it("does not limit organizer-issued tickets", async function () {
        await ticketNFT.connect(organizer).issueTickets(1, 0, Array(6).fill(friend.address));
        expect(await ticketNFT.eventTicketsHeld(1, friend.address)).to.equal(6);
    });

    it("has no limit when set to 0", async function () {
        await setupEvent(ticketNFT, organizer, 3, { perWalletLimit: 0 });
        await ticketNFT.connect(organizer).setSaleActive(3, true);
        await ticketNFT.connect(buyer).buyTickets(3, 0, 10);
        expect(await ticketNFT.eventTicketsHeld(3, buyer.address)).to.equal(10);
    });

    it("locks the limit with the other event terms after the first sale", async function () {
        await ticketNFT.connect(buyer).buyTickets(1, 0, 1);
        const { endTime } = await ticketNFT.eventConfigs(1);
        await expect(
            ticketNFT.connect(organizer).configureEvent(1, endTime, 0, 0, 10)
        ).to.be.revertedWith("Event terms locked: tickets already sold");
    });
});
