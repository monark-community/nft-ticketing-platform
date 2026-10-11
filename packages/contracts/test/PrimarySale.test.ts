import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployTicketNFT, futureTime } from "./helpers";

describe("TicketNFT - Primary Sale & Revenue", function () {
    let ticketNFT: any, usdc: any;
    let admin: any, organizer: any, otherOrganizer: any, buyer: any, buyer2: any, hacker: any;
    let PRICE: bigint, VIP_PRICE: bigint, END_TIME: bigint;
    const EVENT_ID = 1;
    const GA_URI = "ipfs://event-1-ga";
    const VIP_URI = "ipfs://event-1-vip";

    beforeEach(async function () {
        [admin, organizer, otherOrganizer, buyer, buyer2, hacker] = await ethers.getSigners();
        ({ ticketNFT, usdc } = await deployTicketNFT(admin));

        const decimals = await usdc.decimals();
        PRICE = ethers.parseUnits("50", decimals);
        VIP_PRICE = ethers.parseUnits("150", decimals);
        END_TIME = await futureTime();

        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        await ticketNFT.grantRole(ORGANIZER_ROLE, otherOrganizer.address);

        // Fund buyers and approve the contract to take payment
        for (const b of [buyer, buyer2]) {
            await usdc.mint(b.address, ethers.parseUnits("10000", decimals));
            await usdc.connect(b).approve(await ticketNFT.getAddress(), ethers.MaxUint256);
        }
    });

    /** Event 1 with GA (type 0) and VIP (type 1), 10% royalty, 110% resale cap, sale open. */
    async function openSale(gaSupply = 100, vipSupply = 10) {
        await ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 1000, 11000, 0);
        await ticketNFT.connect(organizer).addTicketType(EVENT_ID, PRICE, gaSupply, GA_URI);
        await ticketNFT.connect(organizer).addTicketType(EVENT_ID, VIP_PRICE, vipSupply, VIP_URI);
        await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true);
    }

    describe("Event setup", function () {
        it("lets an organizer configure an event and registers them as its organizer", async function () {
            await expect(ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 500, 11000, 0))
                .to.emit(ticketNFT, "EventConfigured")
                .withArgs(EVENT_ID, organizer.address, END_TIME, 500, 11000, 0);

            const config = await ticketNFT.eventConfigs(EVENT_ID);
            expect(config.endTime).to.equal(END_TIME);
            expect(config.resaleCapBps).to.equal(11000);
            expect(config.configured).to.equal(true);
            expect(config.active).to.equal(false);
            expect(await ticketNFT.royaltyPercentage(EVENT_ID)).to.equal(500);
            expect(await ticketNFT.eventOrganizer(EVENT_ID)).to.equal(organizer.address);
        });

        it("rejects accounts without the organizer role", async function () {
            await expect(
                ticketNFT.connect(hacker).configureEvent(EVENT_ID, END_TIME, 500, 11000, 0)
            ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
        });

        it("prevents another organizer from managing someone else's event", async function () {
            await openSale();
            await expect(
                ticketNFT.connect(otherOrganizer).configureEvent(EVENT_ID, END_TIME, 0, 0, 0)
            ).to.be.revertedWith("Not the event organizer");
            await expect(
                ticketNFT.connect(otherOrganizer).addTicketType(EVENT_ID, 1n, 10, "ipfs://x")
            ).to.be.revertedWith("Not the event organizer");
            await expect(
                ticketNFT.connect(otherOrganizer).updateTicketType(EVENT_ID, 0, 1n, 10, "ipfs://x")
            ).to.be.revertedWith("Not the event organizer");
            await expect(
                ticketNFT.connect(otherOrganizer).setSaleActive(EVENT_ID, false)
            ).to.be.revertedWith("Not the event organizer");
        });

        it("validates the end time, royalty and resale cap", async function () {
            const past = BigInt(await time.latest());
            await expect(
                ticketNFT.connect(organizer).configureEvent(EVENT_ID, past, 500, 11000, 0)
            ).to.be.revertedWith("End time must be in the future");
            await expect(
                ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 10001, 11000, 0)
            ).to.be.revertedWith("Royalty cannot exceed 100%");
            await expect(
                ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 500, 9999, 0)
            ).to.be.revertedWith("Resale cap must be 0 or at least 100% of face value");
            await ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 500, 0, 0);
        });
    });

    describe("Ticket types", function () {
        it("adds ticket types with sequential IDs", async function () {
            await ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 1000, 11000, 0);

            await expect(ticketNFT.connect(organizer).addTicketType(EVENT_ID, PRICE, 100, GA_URI))
                .to.emit(ticketNFT, "TicketTypeConfigured").withArgs(EVENT_ID, 0, PRICE, 100, GA_URI);
            await expect(ticketNFT.connect(organizer).addTicketType(EVENT_ID, VIP_PRICE, 10, VIP_URI))
                .to.emit(ticketNFT, "TicketTypeConfigured").withArgs(EVENT_ID, 1, VIP_PRICE, 10, VIP_URI);

            expect((await ticketNFT.eventConfigs(EVENT_ID)).ticketTypeCount).to.equal(2);
            const vip = await ticketNFT.ticketTypes(EVENT_ID, 1);
            expect(vip.price).to.equal(VIP_PRICE);
            expect(vip.maxSupply).to.equal(10);
            expect(vip.metadataURI).to.equal(VIP_URI);
        });

        it("can't add ticket types before the event is configured", async function () {
            await expect(
                ticketNFT.connect(organizer).addTicketType(EVENT_ID, PRICE, 100, GA_URI)
            ).to.be.revertedWith("Not the event organizer");
        });

        it("rejects zero supply and an empty metadata URI", async function () {
            await ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 1000, 11000, 0);
            await expect(
                ticketNFT.connect(organizer).addTicketType(EVENT_ID, PRICE, 0, GA_URI)
            ).to.be.revertedWith("Max supply must be greater than zero");
            await expect(
                ticketNFT.connect(organizer).addTicketType(EVENT_ID, PRICE, 100, "")
            ).to.be.revertedWith("Metadata URI is required");
        });

        it("allows updating a ticket type until its first sale, then locks it", async function () {
            await openSale();
            await ticketNFT.connect(organizer).updateTicketType(EVENT_ID, 0, PRICE * 2n, 50, GA_URI);
            expect((await ticketNFT.ticketTypes(EVENT_ID, 0)).price).to.equal(PRICE * 2n);

            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            await expect(
                ticketNFT.connect(organizer).updateTicketType(EVENT_ID, 0, PRICE, 50, GA_URI)
            ).to.be.revertedWith("Ticket type locked: tickets already sold");

            // VIP has no sales yet, so it can still be updated
            await ticketNFT.connect(organizer).updateTicketType(EVENT_ID, 1, VIP_PRICE, 20, VIP_URI);
            expect((await ticketNFT.ticketTypes(EVENT_ID, 1)).maxSupply).to.equal(20);
        });

        it("rejects a max supply below the tickets already issued", async function () {
            await openSale();
            await ticketNFT.connect(organizer).issueTickets(EVENT_ID, 1, [buyer.address, buyer.address, buyer.address]);
            await expect(
                ticketNFT.connect(organizer).updateTicketType(EVENT_ID, 1, VIP_PRICE, 2, VIP_URI)
            ).to.be.revertedWith("Max supply is below tickets already issued");
        });

        it("allows adding a new ticket type after sales have started", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            await ticketNFT.connect(organizer).addTicketType(EVENT_ID, PRICE, 20, "ipfs://event-1-late");
            expect((await ticketNFT.eventConfigs(EVENT_ID)).ticketTypeCount).to.equal(3);
        });
    });

    describe("Sale status", function () {
        it("can't open a sale without ticket types", async function () {
            await ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 1000, 11000, 0);
            await expect(
                ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true)
            ).to.be.revertedWith("No ticket types");
        });

        it("opens and pauses sales", async function () {
            await openSale();
            await expect(ticketNFT.connect(organizer).setSaleActive(EVENT_ID, false))
                .to.emit(ticketNFT, "SaleStatusUpdated").withArgs(EVENT_ID, false);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1)).to.be.revertedWith("Sale is not active");

            await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true);
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
        });
    });

    describe("Buying tickets", function () {
        it("takes the USDC and mints a ticket with its event, type and face value", async function () {
            await openSale();
            const contractAddress = await ticketNFT.getAddress();
            const balanceBefore = await usdc.balanceOf(buyer.address);

            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 1, 1))
                .to.emit(ticketNFT, "TicketMinted").withArgs(0, EVENT_ID, 1, buyer.address, VIP_URI)
                .and.to.emit(ticketNFT, "TicketPurchased").withArgs(0, EVENT_ID, 1, buyer.address, VIP_PRICE);

            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
            expect(await ticketNFT.tokenEventId(0)).to.equal(EVENT_ID);
            expect(await ticketNFT.tokenTicketType(0)).to.equal(1);
            expect(await ticketNFT.tokenFaceValue(0)).to.equal(VIP_PRICE);
            expect(await ticketNFT.tokenURI(0)).to.equal(VIP_URI);
            expect(await usdc.balanceOf(buyer.address)).to.equal(balanceBefore - VIP_PRICE);
            expect(await usdc.balanceOf(contractAddress)).to.equal(VIP_PRICE);
        });

        it("buys several tickets in one transaction", async function () {
            await openSale();
            const balanceBefore = await usdc.balanceOf(buyer.address);

            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 3);

            for (let tokenId = 0; tokenId < 3; tokenId++) {
                expect(await ticketNFT.ownerOf(tokenId)).to.equal(buyer.address);
            }
            expect(await usdc.balanceOf(buyer.address)).to.equal(balanceBefore - PRICE * 3n);
            expect((await ticketNFT.ticketTypes(EVENT_ID, 0)).sold).to.equal(3);
            expect((await ticketNFT.eventConfigs(EVENT_ID)).sold).to.equal(3);
        });

        it("rejects a quantity of 0 or more than 100", async function () {
            await openSale(200);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 0))
                .to.be.revertedWith("Quantity must be between 1 and 100");
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 101))
                .to.be.revertedWith("Quantity must be between 1 and 100");
        });

        it("rejects a ticket type that does not exist", async function () {
            await openSale();
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 2, 1))
                .to.be.revertedWith("Ticket type does not exist");
        });

        it("rejects purchases after the event has ended", async function () {
            await openSale();
            await time.increaseTo(END_TIME);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1))
                .to.be.revertedWith("Event has ended");
        });

        it("fails if the buyer hasn't approved enough USDC", async function () {
            await openSale();
            await usdc.connect(buyer).approve(await ticketNFT.getAddress(), PRICE - 1n);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1))
                .to.be.revertedWithCustomError(usdc, "ERC20InsufficientAllowance");
        });

        it("lets anyone get a free ticket type without USDC", async function () {
            await openSale();
            await ticketNFT.connect(organizer).addTicketType(EVENT_ID, 0n, 10, "ipfs://event-1-free");
            await ticketNFT.connect(hacker).buyTickets(EVENT_ID, 2, 1);
            expect(await ticketNFT.ownerOf(0)).to.equal(hacker.address);
        });
    });

    describe("Supply", function () {
        it("enforces each ticket type's own supply", async function () {
            await openSale(2, 1);
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 1, 1);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 1, 1))
                .to.be.revertedWith("Not enough tickets left");

            // GA is a separate type with its own supply
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 2);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1))
                .to.be.revertedWith("Not enough tickets left");
        });

        it("rejects a quantity larger than what is left", async function () {
            await openSale(3);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 4))
                .to.be.revertedWith("Not enough tickets left");
        });

        it("counts organizer-issued tickets toward the type's supply", async function () {
            await openSale(3);
            await ticketNFT.connect(organizer).issueTickets(EVENT_ID, 0, [buyer2.address, buyer2.address]);

            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            await expect(ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1))
                .to.be.revertedWith("Not enough tickets left");
            await expect(ticketNFT.connect(organizer).issueTickets(EVENT_ID, 0, [buyer2.address]))
                .to.be.revertedWith("Not enough tickets left");
        });
    });

    describe("Presale whitelist at purchase", function () {
        it("only lets whitelisted buyers purchase during presale", async function () {
            await openSale();
            await ticketNFT.connect(organizer).setPresaleActive(EVENT_ID, true);
            await ticketNFT.connect(organizer).addToWhitelist(EVENT_ID, buyer.address);

            await expect(ticketNFT.connect(buyer2).buyTickets(EVENT_ID, 0, 1))
                .to.be.revertedWith("Address not whitelisted for presale");
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
        });

        it("lets anyone buy once presale ends", async function () {
            await openSale();
            await ticketNFT.connect(organizer).setPresaleActive(EVENT_ID, true);
            await ticketNFT.connect(organizer).setPresaleActive(EVENT_ID, false);
            await ticketNFT.connect(buyer2).buyTickets(EVENT_ID, 0, 1);
            expect(await ticketNFT.ownerOf(0)).to.equal(buyer2.address);
        });
    });

    describe("Revenue and withdraw", function () {
        it("tracks revenue per event and pays it to the organizer on withdraw", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 2);
            await ticketNFT.connect(buyer2).buyTickets(EVENT_ID, 1, 1);
            const expected = PRICE * 2n + VIP_PRICE;
            expect(await ticketNFT.eventRevenue(EVENT_ID)).to.equal(expected);

            const before = await usdc.balanceOf(organizer.address);
            await expect(ticketNFT.connect(organizer).withdraw(EVENT_ID))
                .to.emit(ticketNFT, "RevenueWithdrawn")
                .withArgs(EVENT_ID, organizer.address, expected);
            expect(await usdc.balanceOf(organizer.address)).to.equal(before + expected);
            expect(await ticketNFT.eventRevenue(EVENT_ID)).to.equal(0);
        });

        it("keeps each event's revenue separate", async function () {
            await openSale();
            await ticketNFT.connect(otherOrganizer).configureEvent(2, END_TIME, 0, 0, 0);
            await ticketNFT.connect(otherOrganizer).addTicketType(2, PRICE * 2n, 100, "ipfs://event-2");
            await ticketNFT.connect(otherOrganizer).setSaleActive(2, true);

            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            await ticketNFT.connect(buyer).buyTickets(2, 0, 1);

            expect(await ticketNFT.eventRevenue(EVENT_ID)).to.equal(PRICE);
            expect(await ticketNFT.eventRevenue(2)).to.equal(PRICE * 2n);
            await expect(ticketNFT.connect(organizer).withdraw(2)).to.be.revertedWith("Not the event organizer");
        });

        it("rejects withdraw from non-organizers and when there's nothing to withdraw", async function () {
            await openSale();
            await expect(ticketNFT.connect(organizer).withdraw(EVENT_ID)).to.be.revertedWith("No revenue to withdraw");
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            await expect(ticketNFT.connect(hacker).withdraw(EVENT_ID)).to.be.revertedWith("Not the event organizer");
        });

        it("does not add revenue for organizer-issued tickets", async function () {
            await openSale();
            await ticketNFT.connect(organizer).issueTickets(EVENT_ID, 0, [buyer.address]);
            expect(await ticketNFT.eventRevenue(EVENT_ID)).to.equal(0);
        });
    });

    describe("Event terms locked once sales start", function () {
        it("allows changing the event's terms before the first sale", async function () {
            await openSale();
            await ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 500, 12000, 0);
            expect(await ticketNFT.royaltyPercentage(EVENT_ID)).to.equal(500);
            expect((await ticketNFT.eventConfigs(EVENT_ID)).resaleCapBps).to.equal(12000);
        });

        it("locks the royalty, resale cap and end time after the first sale", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            await expect(
                ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 500, 12000, 0)
            ).to.be.revertedWith("Event terms locked: tickets already sold");
        });

        it("does not lock the terms when only organizer-issued tickets exist", async function () {
            await openSale();
            await ticketNFT.connect(organizer).issueTickets(EVENT_ID, 0, [buyer.address]);
            await ticketNFT.connect(organizer).configureEvent(EVENT_ID, END_TIME, 500, 12000, 0);
            expect(await ticketNFT.royaltyPercentage(EVENT_ID)).to.equal(500);
        });

        it("still allows pausing and resuming sales after the first sale", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTickets(EVENT_ID, 0, 1);
            await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, false);
            await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true);
            await ticketNFT.connect(buyer2).buyTickets(EVENT_ID, 0, 1);
            expect((await ticketNFT.eventConfigs(EVENT_ID)).sold).to.equal(2);
        });
    });
});
