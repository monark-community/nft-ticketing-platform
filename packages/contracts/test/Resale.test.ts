import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployTicketNFT, setupEvent } from "./helpers";

describe("TicketNFT - Buyer-initiated Resale & Royalties (#209)", function () {
    let ticketNFT: any;
    let usdc: any;
    let admin: any, organizer: any, seller: any, buyer: any, hacker: any;

    const FACE_VALUE = ethers.parseUnits("100", 6);
    const ROYALTY_BPS = 1000;     // 10%
    const RESALE_CAP_BPS = 11000; // 110% of face value
    const CAP = ethers.parseUnits("110", 6);

    beforeEach(async function () {
        [admin, organizer, seller, buyer, hacker] = await ethers.getSigners();
        ({ ticketNFT, usdc } = await deployTicketNFT(admin));
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);

        await setupEvent(ticketNFT, organizer, 1, {
            price: FACE_VALUE,
            royaltyBps: ROYALTY_BPS,
            resaleCapBps: RESALE_CAP_BPS,
        });
        await ticketNFT.connect(organizer).issueTickets(1, 0, [seller.address]); // token 0, face value 100

        await usdc.mint(buyer.address, ethers.parseUnits("10000", 6));
        await usdc.connect(buyer).approve(await ticketNFT.getAddress(), ethers.MaxUint256);
    });

    describe("Listing", function () {
        it("lets the owner list a ticket without moving it", async function () {
            await expect(ticketNFT.connect(seller).listForResale(0, FACE_VALUE))
                .to.emit(ticketNFT, "TicketListed").withArgs(0, seller.address, FACE_VALUE);

            const listing = await ticketNFT.listings(0);
            expect(listing.seller).to.equal(seller.address);
            expect(listing.price).to.equal(FACE_VALUE);
            expect(listing.royaltyBps).to.equal(ROYALTY_BPS);
            expect(await ticketNFT.ownerOf(0)).to.equal(seller.address);
        });

        it("allows listing exactly at the cap (face value x resale cap)", async function () {
            expect(await ticketNFT.maxResalePriceOf(0)).to.equal(CAP);
            await ticketNFT.connect(seller).listForResale(0, CAP);
        });

        it("rejects a price above the cap", async function () {
            await expect(ticketNFT.connect(seller).listForResale(0, CAP + 1n))
                .to.be.revertedWith("Sale price exceeds maximum resale price");
        });

        it("rejects listing a ticket you don't own", async function () {
            await expect(ticketNFT.connect(hacker).listForResale(0, FACE_VALUE))
                .to.be.revertedWith("You do not own this ticket");
        });

        it("lets only the seller cancel the listing", async function () {
            await ticketNFT.connect(seller).listForResale(0, FACE_VALUE);
            await expect(ticketNFT.connect(hacker).cancelListing(0))
                .to.be.revertedWith("Not the seller of this listing");

            await expect(ticketNFT.connect(seller).cancelListing(0))
                .to.emit(ticketNFT, "ListingCancelled").withArgs(0, seller.address);
            expect((await ticketNFT.listings(0)).seller).to.equal(ethers.ZeroAddress);
        });

        it("rejects a price of zero", async function () {
            await expect(ticketNFT.connect(seller).listForResale(0, 0))
                .to.be.revertedWith("Price must be greater than zero");
        });

    });

    describe("Buying", function () {
        beforeEach(async function () {
            await ticketNFT.connect(seller).listForResale(0, FACE_VALUE);
        });

        it("transfers the ticket to the buyer and emits TicketResold", async function () {
            await expect(ticketNFT.connect(buyer).buyResaleTicket(0, FACE_VALUE))
                .to.emit(ticketNFT, "TicketResold").withArgs(0, seller.address, buyer.address, FACE_VALUE);
            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
        });

        it("pays the royalty to the organizer and the rest to the seller", async function () {
            const sellerBefore = await usdc.balanceOf(seller.address);
            const organizerBefore = await usdc.balanceOf(organizer.address);

            await ticketNFT.connect(buyer).buyResaleTicket(0, FACE_VALUE);

            const royalty = (FACE_VALUE * BigInt(ROYALTY_BPS)) / 10000n;
            expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore + FACE_VALUE - royalty);
            expect(await usdc.balanceOf(organizer.address)).to.equal(organizerBefore + royalty);
        });

        it("clears the listing after the sale", async function () {
            await ticketNFT.connect(buyer).buyResaleTicket(0, FACE_VALUE);
            expect((await ticketNFT.listings(0)).seller).to.equal(ethers.ZeroAddress);
        });

        it("clears the listing when the ticket is checked in", async function () {
            await expect(ticketNFT.connect(organizer).checkInTicket(0))
                .to.emit(ticketNFT, "ListingCancelled").withArgs(0, seller.address);

            expect((await ticketNFT.listings(0)).seller).to.equal(ethers.ZeroAddress);
            await expect(ticketNFT.connect(buyer).buyResaleTicket(0, FACE_VALUE))
                .to.be.revertedWith("Ticket is not listed");
        });


        it("rejects a ticket that is not listed", async function () {
            await ticketNFT.connect(seller).cancelListing(0);
            await expect(ticketNFT.connect(buyer).buyResaleTicket(0, FACE_VALUE))
                .to.be.revertedWith("Ticket is not listed");
        });

        it("rejects the purchase if the seller changed the price", async function () {
            await ticketNFT.connect(seller).listForResale(0, CAP);
            await expect(ticketNFT.connect(buyer).buyResaleTicket(0, FACE_VALUE))
                .to.be.revertedWith("Listing price changed");
        });

        it("rejects buying your own listing", async function () {
            await expect(ticketNFT.connect(seller).buyResaleTicket(0, FACE_VALUE))
                .to.be.revertedWith("Cannot buy your own ticket");
        });

        it("fails if the buyer hasn't approved enough USDC", async function () {
            await expect(ticketNFT.connect(hacker).buyResaleTicket(0, FACE_VALUE)).to.be.reverted;
            expect(await ticketNFT.ownerOf(0)).to.equal(seller.address);
        });

        it("ends the listing when the ticket is transferred, even if it comes back", async function () {
            await ticketNFT.connect(seller).transferFrom(seller.address, hacker.address, 0);
            await ticketNFT.connect(hacker).transferFrom(hacker.address, seller.address, 0);

            await expect(ticketNFT.connect(buyer).buyResaleTicket(0, FACE_VALUE))
                .to.be.revertedWith("Ticket is not listed");
        });
    });

    describe("A seller can no longer charge a buyer", function () {
        it("has no seller-initiated resell() anymore", async function () {
            expect(ticketNFT.resell).to.equal(undefined);
        });

        it("never takes USDC from a buyer who didn't accept", async function () {
            const before = await usdc.balanceOf(buyer.address);
            await ticketNFT.connect(seller).listForResale(0, FACE_VALUE);
            expect(await usdc.balanceOf(buyer.address)).to.equal(before);
            expect(await ticketNFT.ownerOf(0)).to.equal(seller.address);
        });
    });

    it("allows any price when the event has no cap", async function () {
        await setupEvent(ticketNFT, organizer, 2, { price: FACE_VALUE, resaleCapBps: 0 });
        await ticketNFT.connect(organizer).issueTickets(2, 0, [seller.address]); // token 1
        const price = ethers.parseUnits("999", 6);

        expect(await ticketNFT.resaleCapApplies(1)).to.be.false;
        await ticketNFT.connect(seller).listForResale(1, price);
        await ticketNFT.connect(buyer).buyResaleTicket(1, price);
        expect(await ticketNFT.ownerOf(1)).to.equal(buyer.address);
    });

    describe("Collectibles: no cap after use or after the event", function () {
        it("lets a used ticket be resold above the cap, with royalty", async function () {
            await ticketNFT.connect(organizer).checkInTicket(0);
            const price = ethers.parseUnits("500", 6);
            const organizerBefore = await usdc.balanceOf(organizer.address);

            await ticketNFT.connect(seller).listForResale(0, price);
            await ticketNFT.connect(buyer).buyResaleTicket(0, price);

            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
            expect(await usdc.balanceOf(organizer.address)).to.equal(
                organizerBefore + (price * BigInt(ROYALTY_BPS)) / 10000n
            );
        });

        it("lets an unused ticket be resold above the cap after the event ends", async function () {
            const { endTime } = await ticketNFT.eventConfigs(1);
            await time.increaseTo(endTime);
            const price = ethers.parseUnits("800", 6);

            await ticketNFT.connect(seller).listForResale(0, price);
            await ticketNFT.connect(buyer).buyResaleTicket(0, price);
            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
        });
    });
});
