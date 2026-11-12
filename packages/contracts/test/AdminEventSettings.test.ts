import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployTicketNFT, futureTime, setupEvent } from "./helpers";

describe("TicketNFT - Admin event settings (#293)", function () {
    let ticketNFT: any, usdc: any;
    let admin: any, organizer: any, seller: any, buyer: any, hacker: any;
    let END_TIME: bigint;

    const FACE_VALUE = ethers.parseUnits("100", 6);

    beforeEach(async function () {
        [admin, organizer, seller, buyer, hacker] = await ethers.getSigners();
        ({ ticketNFT, usdc } = await deployTicketNFT(admin));
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);

        // 10% royalty, 110% cap, paid tickets
        await setupEvent(ticketNFT, organizer, 1, { price: FACE_VALUE, royaltyBps: 1000, resaleCapBps: 11000 });
        await ticketNFT.connect(organizer).setSaleActive(1, true);
        END_TIME = await futureTime(14 * 24 * 60 * 60);

        for (const wallet of [seller, buyer]) {
            await usdc.mint(wallet.address, ethers.parseUnits("10000", 6));
            await usdc.connect(wallet).approve(await ticketNFT.getAddress(), ethers.MaxUint256);
        }
    });

    async function firstSale() {
        await ticketNFT.connect(seller).buyTickets(1, 0, 1); // token 0
    }

    it("lets the admin update the settings before a sale", async function () {
        await ticketNFT.connect(admin).adminUpdateEventSettings(1, END_TIME, 500, 12000, 3);

        const config = await ticketNFT.eventConfigs(1);
        expect(config.endTime).to.equal(END_TIME);
        expect(config.resaleCapBps).to.equal(12000);
        expect(config.perWalletLimit).to.equal(3);
        expect(await ticketNFT.royaltyPercentage(1)).to.equal(500);
    });

    it("lets the admin update the settings after a sale", async function () {
        await firstSale();
        await ticketNFT.connect(admin).adminUpdateEventSettings(1, END_TIME, 2000, 15000, 0);
        expect(await ticketNFT.royaltyPercentage(1)).to.equal(2000);
        expect((await ticketNFT.eventConfigs(1)).resaleCapBps).to.equal(15000);
    });

    it("keeps the organizer blocked after the first sale", async function () {
        await firstSale();
        await ticketNFT.connect(admin).adminUpdateEventSettings(1, END_TIME, 2000, 15000, 0);
        await expect(
            ticketNFT.connect(organizer).configureEvent(1, END_TIME, 500, 12000, 0)
        ).to.be.revertedWith("Event terms locked: tickets already sold");
    });

    it("rejects non-admins, including the event's organizer", async function () {
        for (const wallet of [organizer, hacker]) {
            await expect(
                ticketNFT.connect(wallet).adminUpdateEventSettings(1, END_TIME, 500, 12000, 0)
            ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
        }
    });

    it("rejects invalid values and unconfigured events", async function () {
        const past = (await futureTime(0)) - 1n;
        await expect(ticketNFT.adminUpdateEventSettings(1, past, 500, 12000, 0))
            .to.be.revertedWith("End time must be in the future");
        await expect(ticketNFT.adminUpdateEventSettings(1, END_TIME, 10001, 12000, 0))
            .to.be.revertedWith("Royalty cannot exceed 100%");
        await expect(ticketNFT.adminUpdateEventSettings(1, END_TIME, 500, 9999, 0))
            .to.be.revertedWith("Resale cap must be 0 or at least 100% of face value");
        await expect(ticketNFT.adminUpdateEventSettings(2, END_TIME, 500, 12000, 0))
            .to.be.revertedWith("Event not configured");
    });

    it("keeps the event's organizer and emits both events", async function () {
        await expect(ticketNFT.connect(admin).adminUpdateEventSettings(1, END_TIME, 500, 12000, 0))
            .to.emit(ticketNFT, "EventConfigured").withArgs(1, organizer.address, END_TIME, 500, 12000, 0)
            .and.to.emit(ticketNFT, "EventSettingsUpdatedByAdmin").withArgs(1, admin.address);

        expect(await ticketNFT.eventOrganizer(1)).to.equal(organizer.address);
    });

    it("applies the new royalty and resale cap to the next resale", async function () {
        await firstSale();
        await ticketNFT.connect(admin).adminUpdateEventSettings(1, END_TIME, 2000, 15000, 0); // 20%, 150%

        const price = ethers.parseUnits("150", 6); // above the old 110% cap, within the new 150%
        await ticketNFT.connect(seller).listForResale(0, price);

        const organizerBefore = await usdc.balanceOf(organizer.address);
        await ticketNFT.connect(buyer).buyResaleTicket(0, price);

        expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
        expect(await usdc.balanceOf(organizer.address)).to.equal(organizerBefore + (price * 2000n) / 10000n);
    });

    it("re-checks the cap at purchase if the admin lowers it after a listing", async function () {
        await firstSale();
        await ticketNFT.connect(seller).listForResale(0, ethers.parseUnits("110", 6));
        await ticketNFT.connect(admin).adminUpdateEventSettings(1, END_TIME, 1000, 10000, 0); // cap 100%

        await expect(ticketNFT.connect(buyer).buyResaleTicket(0, ethers.parseUnits("110", 6)))
            .to.be.revertedWith("Sale price exceeds maximum resale price");
    });

    it("makes the seller relist if the admin changes the royalty after listing", async function () {
        await firstSale();
        const price = ethers.parseUnits("110", 6);
        await ticketNFT.connect(seller).listForResale(0, price); // listed at 10% royalty

        await ticketNFT.connect(admin).adminUpdateEventSettings(1, END_TIME, 2000, 11000, 0); // royalty -> 20%
        await expect(ticketNFT.connect(buyer).buyResaleTicket(0, price))
            .to.be.revertedWith("Royalty changed since listing");

        // Relisting means the seller accepts the new royalty
        await ticketNFT.connect(seller).listForResale(0, price);
        const sellerBefore = await usdc.balanceOf(seller.address);
        await ticketNFT.connect(buyer).buyResaleTicket(0, price);

        expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
        expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore + price - (price * 2000n) / 10000n);
    });

    it("lets the admin keep the current end time while sales are open", async function () {
        const current = (await ticketNFT.eventConfigs(1)).endTime;
        await ticketNFT.connect(admin).adminUpdateEventSettings(1, current, 500, 11000, 0);

        expect((await ticketNFT.eventConfigs(1)).endTime).to.equal(current);
        await firstSale(); // still on sale
    });

    // Monark (Oct 27): admins can change settings at any time. Once sales have ended, keeping the
    // event's end time changes the other settings without reopening sales.
    describe("after ticket sales have ended", function () {
        let ended: bigint;

        beforeEach(async function () {
            await firstSale(); // token 0, held by the seller
            ended = (await ticketNFT.eventConfigs(1)).endTime;
            await time.increaseTo(ended + 60n);
        });

        it("changes the royalty and per-wallet limit and keeps sales closed", async function () {
            await expect(ticketNFT.connect(admin).adminUpdateEventSettings(1, ended, 500, 11000, 2))
                .to.emit(ticketNFT, "EventConfigured").withArgs(1, organizer.address, ended, 500, 11000, 2)
                .and.to.emit(ticketNFT, "EventSettingsUpdatedByAdmin").withArgs(1, admin.address);

            const config = await ticketNFT.eventConfigs(1);
            expect(config.endTime).to.equal(ended);
            expect(config.perWalletLimit).to.equal(2);
            expect(await ticketNFT.royaltyPercentage(1)).to.equal(500);

            await expect(ticketNFT.connect(buyer).buyTickets(1, 0, 1)).to.be.revertedWith("Event has ended");
        });

        it("leaves the resale cap off and applies the new royalty to the next resale", async function () {
            await ticketNFT.connect(admin).adminUpdateEventSettings(1, ended, 500, 11000, 0); // royalty 10% -> 5%
            expect(await ticketNFT.resaleCapApplies(0)).to.equal(false);

            const price = ethers.parseUnits("500", 6); // far above the 110% cap, allowed after sales end
            await ticketNFT.connect(seller).listForResale(0, price);
            const organizerBefore = await usdc.balanceOf(organizer.address);
            await ticketNFT.connect(buyer).buyResaleTicket(0, price);

            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
            expect(await usdc.balanceOf(organizer.address)).to.equal(organizerBefore + (price * 500n) / 10000n);
        });

        it("refuses a different end time that has also passed", async function () {
            for (const endTime of [ended - 1n, ended + 1n]) {
                await expect(ticketNFT.connect(admin).adminUpdateEventSettings(1, endTime, 500, 11000, 0))
                    .to.be.revertedWith("End time must be in the future");
            }
        });

        it("reopens sales and the resale cap with a new end time in the future", async function () {
            const reopened = await futureTime(24 * 60 * 60);
            await ticketNFT.connect(admin).adminUpdateEventSettings(1, reopened, 1000, 11000, 0);

            expect(await ticketNFT.resaleCapApplies(0)).to.equal(true);
            await expect(ticketNFT.connect(seller).listForResale(0, ethers.parseUnits("500", 6)))
                .to.be.revertedWith("Sale price exceeds maximum resale price");
            await ticketNFT.connect(buyer).buyTickets(1, 0, 1);
            expect(await ticketNFT.ownerOf(1)).to.equal(buyer.address);
        });

        it("still checks the royalty and the resale cap", async function () {
            await expect(ticketNFT.adminUpdateEventSettings(1, ended, 10001, 11000, 0))
                .to.be.revertedWith("Royalty cannot exceed 100%");
            await expect(ticketNFT.adminUpdateEventSettings(1, ended, 500, 9999, 0))
                .to.be.revertedWith("Resale cap must be 0 or at least 100% of face value");
        });

        it("still rejects non-admins", async function () {
            await expect(ticketNFT.connect(organizer).adminUpdateEventSettings(1, ended, 500, 11000, 0))
                .to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
        });
    });

    it("doesn't let the organizer keep an end time that has passed", async function () {
        const ending = await futureTime(60 * 60);
        await setupEvent(ticketNFT, organizer, 2, { endTime: ending }); // no tickets sold
        await time.increaseTo(ending + 60n);

        await expect(ticketNFT.connect(organizer).configureEvent(2, ending, 500, 11000, 0))
            .to.be.revertedWith("End time must be in the future");
    });

});
