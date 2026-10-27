import { expect } from "chai";
import { ethers } from "hardhat";
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
});
