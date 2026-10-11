import { expect } from "chai";
import { ethers } from "hardhat";
import { deployTicketNFT, setupEvent } from "./helpers";

describe("TicketNFT - Whitelist Mechanism", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, hacker: any, whitelisted: any, notWhitelisted: any;

    beforeEach(async function () {
        [admin, organizer, hacker, whitelisted, notWhitelisted] = await ethers.getSigners();
        ({ ticketNFT } = await deployTicketNFT(admin));
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
    });

    async function openFreeSale() {
        await setupEvent(ticketNFT, organizer, 1);
        await ticketNFT.connect(organizer).setSaleActive(1, true);
    }

    it("Should allow organizer to add and remove from whitelist", async function () {
        await ticketNFT.connect(organizer).addToWhitelist(1, whitelisted.address);
        expect(await ticketNFT.isWhitelisted(1, whitelisted.address)).to.be.true;

        await ticketNFT.connect(organizer).removeFromWhitelist(1, whitelisted.address);
        expect(await ticketNFT.isWhitelisted(1, whitelisted.address)).to.be.false;
    });

    it("Should allow organizer to batch add to whitelist", async function () {
        const wallets = [whitelisted.address, notWhitelisted.address];
        await ticketNFT.connect(organizer).batchAddToWhitelist(1, wallets);

        expect(await ticketNFT.isWhitelisted(1, whitelisted.address)).to.be.true;
        expect(await ticketNFT.isWhitelisted(1, notWhitelisted.address)).to.be.true;
    });

    it("Should reject hacker from modifying whitelist", async function () {
        await expect(
            ticketNFT.connect(hacker).addToWhitelist(1, whitelisted.address)
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("Should allow whitelisted address to buy during presale", async function () {
        await openFreeSale();
        await ticketNFT.connect(organizer).addToWhitelist(1, whitelisted.address);
        await ticketNFT.connect(organizer).setPresaleActive(1, true);

        await expect(ticketNFT.connect(whitelisted).buyTickets(1, 0, 1)).to.not.be.reverted;
    });

    it("Should reject non-whitelisted address during presale", async function () {
        await openFreeSale();
        await ticketNFT.connect(organizer).setPresaleActive(1, true);

        await expect(
            ticketNFT.connect(notWhitelisted).buyTickets(1, 0, 1)
        ).to.be.revertedWith("Address not whitelisted for presale");
    });

    it("Should allow anyone to buy during public sale", async function () {
        await openFreeSale();
        await ticketNFT.connect(organizer).setPresaleActive(1, false);

        await expect(ticketNFT.connect(notWhitelisted).buyTickets(1, 0, 1)).to.not.be.reverted;
    });

    it("Should emit WhitelistUpdated event", async function () {
        await expect(ticketNFT.connect(organizer).addToWhitelist(1, whitelisted.address))
            .to.emit(ticketNFT, "WhitelistUpdated")
            .withArgs(1, whitelisted.address, true);
    });

    it("Should emit PresaleStatusUpdated event", async function () {
        await expect(ticketNFT.connect(organizer).setPresaleActive(1, true))
            .to.emit(ticketNFT, "PresaleStatusUpdated")
            .withArgs(1, true);
    });

    it("Should revert batch whitelist if empty", async function () {
        await expect(
            ticketNFT.connect(organizer).batchAddToWhitelist(1, [])
        ).to.be.revertedWith("Must provide at least one address");
    });

    it("Should revert batch whitelist if exceeds 100", async function () {
        const wallets = Array(101).fill(whitelisted.address);
        await expect(
            ticketNFT.connect(organizer).batchAddToWhitelist(1, wallets)
        ).to.be.revertedWith("Batch size cannot exceed 100");
    });

    it("Should not apply the presale whitelist to organizer-issued tickets", async function () {
        await setupEvent(ticketNFT, organizer, 1);
        await ticketNFT.connect(organizer).setPresaleActive(1, true);

        await expect(
            ticketNFT.connect(organizer).issueTickets(1, 0, [notWhitelisted.address])
        ).to.not.be.reverted;
    });

    it("Should transition correctly from presale to public sale", async function () {
        await openFreeSale();
        await ticketNFT.connect(organizer).setPresaleActive(1, true);
        await expect(
            ticketNFT.connect(notWhitelisted).buyTickets(1, 0, 1)
        ).to.be.revertedWith("Address not whitelisted for presale");

        await ticketNFT.connect(organizer).setPresaleActive(1, false);
        await expect(ticketNFT.connect(notWhitelisted).buyTickets(1, 0, 1)).to.not.be.reverted;
    });
});
