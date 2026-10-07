import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployTicketNFT, setupEvent } from "./helpers";

describe("TicketNFT - Resale Rules & Royalties", function () {
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

    it("Should successfully resell a ticket", async function () {
        await ticketNFT.connect(seller).resell(0, buyer.address, FACE_VALUE);
        expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
    });

    it("Should pay royalty to organizer and remainder to seller", async function () {
        const salePrice = FACE_VALUE;
        const sellerBefore = await usdc.balanceOf(seller.address);
        const organizerBefore = await usdc.balanceOf(organizer.address);

        await ticketNFT.connect(seller).resell(0, buyer.address, salePrice);

        const royalty = (salePrice * BigInt(ROYALTY_BPS)) / 10000n;
        expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore + salePrice - royalty);
        expect(await usdc.balanceOf(organizer.address)).to.equal(organizerBefore + royalty);
    });

    it("Should allow resale exactly at the cap (face value x resale cap)", async function () {
        expect(await ticketNFT.maxResalePriceOf(0)).to.equal(CAP);
        await ticketNFT.connect(seller).resell(0, buyer.address, CAP);
        expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
    });

    it("Should revert if sale price exceeds the cap", async function () {
        await expect(
            ticketNFT.connect(seller).resell(0, buyer.address, CAP + 1n)
        ).to.be.revertedWith("Sale price exceeds maximum resale price");
    });

    it("Should revert if caller does not own the ticket", async function () {
        await expect(
            ticketNFT.connect(hacker).resell(0, buyer.address, FACE_VALUE)
        ).to.be.revertedWith("You do not own this ticket");
    });

    it("Should revert if buyer address is zero", async function () {
        await expect(
            ticketNFT.connect(seller).resell(0, ethers.ZeroAddress, FACE_VALUE)
        ).to.be.revertedWith("Invalid buyer address");
    });

    it("Should emit TicketResold event", async function () {
        await expect(ticketNFT.connect(seller).resell(0, buyer.address, FACE_VALUE))
            .to.emit(ticketNFT, "TicketResold")
            .withArgs(0, seller.address, buyer.address, FACE_VALUE);
    });

    it("Should allow any resale price when the event has no cap", async function () {
        await setupEvent(ticketNFT, organizer, 2, { price: FACE_VALUE, resaleCapBps: 0 });
        await ticketNFT.connect(organizer).issueTickets(2, 0, [seller.address]); // token 1

        expect(await ticketNFT.resaleCapApplies(1)).to.be.false;
        await ticketNFT.connect(seller).resell(1, buyer.address, ethers.parseUnits("999", 6));
        expect(await ticketNFT.ownerOf(1)).to.equal(buyer.address);
    });

    describe("Collectibles: no cap after use or after the event", function () {
        it("Should allow a used ticket to be resold above the cap, with royalty", async function () {
            await ticketNFT.connect(organizer).checkInTicket(0);
            expect(await ticketNFT.resaleCapApplies(0)).to.be.false;

            const salePrice = ethers.parseUnits("500", 6);
            const organizerBefore = await usdc.balanceOf(organizer.address);
            await ticketNFT.connect(seller).resell(0, buyer.address, salePrice);

            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
            expect(await usdc.balanceOf(organizer.address)).to.equal(
                organizerBefore + (salePrice * BigInt(ROYALTY_BPS)) / 10000n
            );
        });

        it("Should allow an unused ticket to be resold above the cap after the event ends, with royalty", async function () {
            const { endTime } = await ticketNFT.eventConfigs(1);
            await time.increaseTo(endTime);
            expect(await ticketNFT.resaleCapApplies(0)).to.be.false;

            const salePrice = ethers.parseUnits("800", 6);
            const organizerBefore = await usdc.balanceOf(organizer.address);
            await ticketNFT.connect(seller).resell(0, buyer.address, salePrice);

            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
            expect(await usdc.balanceOf(organizer.address)).to.equal(
                organizerBefore + (salePrice * BigInt(ROYALTY_BPS)) / 10000n
            );
        });

        it("Should still apply the cap to an unused ticket before the event ends", async function () {
            expect(await ticketNFT.resaleCapApplies(0)).to.be.true;
            await expect(
                ticketNFT.connect(seller).resell(0, buyer.address, CAP + 1n)
            ).to.be.revertedWith("Sale price exceeds maximum resale price");
        });
    });
});
