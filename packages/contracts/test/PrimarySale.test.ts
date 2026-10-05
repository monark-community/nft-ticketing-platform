import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Primary Sale & Revenue", function () {
    let ticketNFT: any, usdc: any;
    let admin: any, organizer: any, otherOrganizer: any, buyer: any, buyer2: any, hacker: any;
    let PRICE: bigint, RESALE_CAP: bigint;
    const EVENT_ID = 1;
    const URI = "ipfs://event-1-metadata";

    beforeEach(async function () {
        [admin, organizer, otherOrganizer, buyer, buyer2, hacker] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        const decimals = await usdc.decimals();
        PRICE = ethers.parseUnits("50", decimals);
        RESALE_CAP = ethers.parseUnits("75", decimals);

        const TicketNFT = await ethers.getContractFactory("TicketNFT");
        ticketNFT = await upgrades.deployProxy(
            TicketNFT,
            [admin.address, await usdc.getAddress()],
            { kind: "uups" }
        );

        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        await ticketNFT.grantRole(ORGANIZER_ROLE, otherOrganizer.address);

        // Fund buyers and approve the contract to take payment
        for (const b of [buyer, buyer2]) {
            await usdc.transfer(b.address, PRICE * 10n);
            await usdc.connect(b).approve(await ticketNFT.getAddress(), PRICE * 10n);
        }
    });

    async function openSale(maxSupply = 100) {
        await ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, maxSupply, RESALE_CAP, URI);
        await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true);
    }

    describe("Sale setup", function () {
        it("lets an organizer configure a sale and registers them as the event organizer", async function () {
            await expect(ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, 100, RESALE_CAP, URI))
                .to.emit(ticketNFT, "SaleConfigured")
                .withArgs(EVENT_ID, PRICE, 100, RESALE_CAP, URI);

            const sale = await ticketNFT.eventSales(EVENT_ID);
            expect(sale.price).to.equal(PRICE);
            expect(sale.maxSupply).to.equal(100);
            expect(sale.maxResalePrice).to.equal(RESALE_CAP);
            expect(sale.metadataURI).to.equal(URI);
            expect(sale.active).to.equal(false);
            expect(await ticketNFT.eventOrganizer(EVENT_ID)).to.equal(organizer.address);
        });

        it("rejects accounts without the organizer role", async function () {
            await expect(
                ticketNFT.connect(hacker).configureSale(EVENT_ID, PRICE, 100, RESALE_CAP, URI)
            ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
        });

        it("prevents another organizer from changing someone else's event", async function () {
            await ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, 100, RESALE_CAP, URI);
            await expect(
                ticketNFT.connect(otherOrganizer).configureSale(EVENT_ID, 1n, 100, 0, URI)
            ).to.be.revertedWith("Not the event organizer");
            await expect(
                ticketNFT.connect(otherOrganizer).setSaleActive(EVENT_ID, true)
            ).to.be.revertedWith("Not the event organizer");
        });

        it("rejects zero supply and an empty metadata URI", async function () {
            await expect(
                ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, 0, RESALE_CAP, URI)
            ).to.be.revertedWith("Max supply must be greater than zero");
            await expect(
                ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, 100, RESALE_CAP, "")
            ).to.be.revertedWith("Metadata URI is required");
        });

        it("can't open a sale that hasn't been configured", async function () {
            await expect(
                ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true)
            ).to.be.revertedWith("Not the event organizer");
        });
    });

    describe("Buying a ticket", function () {
        it("takes the USDC and mints the ticket to the buyer with the event's terms", async function () {
            await openSale();
            const contractAddress = await ticketNFT.getAddress();
            const balanceBefore = await usdc.balanceOf(buyer.address);

            await expect(ticketNFT.connect(buyer).buyTicket(EVENT_ID))
                .to.emit(ticketNFT, "TicketMinted").withArgs(0, EVENT_ID, buyer.address, URI)
                .and.to.emit(ticketNFT, "TicketPurchased").withArgs(0, EVENT_ID, buyer.address, PRICE);

            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
            expect(await ticketNFT.tokenEventId(0)).to.equal(EVENT_ID);
            expect(await ticketNFT.tokenURI(0)).to.equal(URI);
            expect(await ticketNFT.maxResalePrice(0)).to.equal(RESALE_CAP);
            expect(await usdc.balanceOf(buyer.address)).to.equal(balanceBefore - PRICE);
            expect(await usdc.balanceOf(contractAddress)).to.equal(PRICE);
            expect((await ticketNFT.eventSales(EVENT_ID)).sold).to.equal(1);
        });

        it("rejects purchases when the sale isn't active", async function () {
            await ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, 100, RESALE_CAP, URI);
            await expect(ticketNFT.connect(buyer).buyTicket(EVENT_ID)).to.be.revertedWith("Sale is not active");

            await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true);
            await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, false);
            await expect(ticketNFT.connect(buyer).buyTicket(EVENT_ID)).to.be.revertedWith("Sale is not active");
        });

        it("fails if the buyer hasn't approved enough USDC", async function () {
            await openSale();
            await usdc.connect(buyer).approve(await ticketNFT.getAddress(), 0);
            await expect(ticketNFT.connect(buyer).buyTicket(EVENT_ID))
                .to.be.revertedWithCustomError(usdc, "ERC20InsufficientAllowance");
        });

        it("lets a bought ticket be resold within its resale cap", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await expect(
                ticketNFT.connect(buyer).resell(0, buyer2.address, RESALE_CAP + 1n)
            ).to.be.revertedWith("Sale price exceeds maximum resale price");
            await ticketNFT.connect(buyer).resell(0, buyer2.address, RESALE_CAP);
            expect(await ticketNFT.ownerOf(0)).to.equal(buyer2.address);
        });
    });

    describe("Supply cap", function () {
        it("stops selling once max supply is reached", async function () {
            await openSale(2);
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await ticketNFT.connect(buyer2).buyTicket(EVENT_ID);
            await expect(ticketNFT.connect(buyer).buyTicket(EVENT_ID)).to.be.revertedWith("Sold out");
            expect((await ticketNFT.eventSales(EVENT_ID)).sold).to.equal(2);
        });

        it("counts organizer-issued tickets toward max supply", async function () {
            await openSale(3);
            await ticketNFT.connect(organizer).mintTicket(buyer2.address, "ipfs://comp-1", EVENT_ID, 0);
            await ticketNFT.connect(organizer).batchMint([buyer2.address], ["ipfs://comp-2"], [0], EVENT_ID);
            expect(await ticketNFT.organizerIssued(EVENT_ID)).to.equal(2);

            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await expect(ticketNFT.connect(buyer).buyTicket(EVENT_ID)).to.be.revertedWith("Sold out");
        });

        it("rejects organizer minting beyond max supply", async function () {
            await openSale(2);
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await expect(
                ticketNFT.connect(organizer).batchMint(
                    [buyer2.address, buyer2.address], ["ipfs://a", "ipfs://b"], [0, 0], EVENT_ID
                )
            ).to.be.revertedWith("Exceeds max supply");
            await ticketNFT.connect(organizer).mintTicket(buyer2.address, "ipfs://a", EVENT_ID, 0);
            await expect(
                ticketNFT.connect(organizer).mintTicket(buyer2.address, "ipfs://b", EVENT_ID, 0)
            ).to.be.revertedWith("Exceeds max supply");
        });

        it("rejects a max supply below the tickets already issued", async function () {
            await ticketNFT.connect(organizer).batchMint(
                [buyer.address, buyer.address, buyer.address], ["ipfs://a", "ipfs://b", "ipfs://c"], [0, 0, 0], EVENT_ID
            );
            await expect(
                ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, 2, RESALE_CAP, URI)
            ).to.be.revertedWith("Max supply is below tickets already issued");
            await ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE, 3, RESALE_CAP, URI);
        });

        it("does not lock sale terms when only organizer-issued tickets exist", async function () {
            await openSale();
            await ticketNFT.connect(organizer).mintTicket(buyer.address, "ipfs://comp", EVENT_ID, 0);
            await ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE * 2n, 100, RESALE_CAP, URI);
            expect((await ticketNFT.eventSales(EVENT_ID)).price).to.equal(PRICE * 2n);
        });
    });

    describe("Presale whitelist at purchase", function () {
        it("only lets whitelisted buyers purchase during presale", async function () {
            await openSale();
            await ticketNFT.connect(organizer).setPresaleActive(EVENT_ID, true);
            await ticketNFT.connect(organizer).addToWhitelist(EVENT_ID, buyer.address);

            await expect(ticketNFT.connect(buyer2).buyTicket(EVENT_ID))
                .to.be.revertedWith("Address not whitelisted for presale");
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
        });

        it("lets anyone buy once presale ends", async function () {
            await openSale();
            await ticketNFT.connect(organizer).setPresaleActive(EVENT_ID, true);
            await ticketNFT.connect(organizer).setPresaleActive(EVENT_ID, false);
            await ticketNFT.connect(buyer2).buyTicket(EVENT_ID);
            expect(await ticketNFT.ownerOf(0)).to.equal(buyer2.address);
        });
    });

    describe("Revenue and withdraw", function () {
        it("tracks revenue per event and pays it to the organizer on withdraw", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await ticketNFT.connect(buyer2).buyTicket(EVENT_ID);
            expect(await ticketNFT.eventRevenue(EVENT_ID)).to.equal(PRICE * 2n);

            const before = await usdc.balanceOf(organizer.address);
            await expect(ticketNFT.connect(organizer).withdraw(EVENT_ID))
                .to.emit(ticketNFT, "RevenueWithdrawn")
                .withArgs(EVENT_ID, organizer.address, PRICE * 2n);
            expect(await usdc.balanceOf(organizer.address)).to.equal(before + PRICE * 2n);
            expect(await ticketNFT.eventRevenue(EVENT_ID)).to.equal(0);
        });

        it("keeps each event's revenue separate", async function () {
            await openSale();
            await ticketNFT.connect(otherOrganizer).configureSale(2, PRICE * 2n, 100, 0, "ipfs://event-2");
            await ticketNFT.connect(otherOrganizer).setSaleActive(2, true);

            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await ticketNFT.connect(buyer).buyTicket(2);

            expect(await ticketNFT.eventRevenue(EVENT_ID)).to.equal(PRICE);
            expect(await ticketNFT.eventRevenue(2)).to.equal(PRICE * 2n);
            await expect(ticketNFT.connect(organizer).withdraw(2)).to.be.revertedWith("Not the event organizer");
        });

        it("rejects withdraw from non-organizers and when there's nothing to withdraw", async function () {
            await openSale();
            await expect(ticketNFT.connect(organizer).withdraw(EVENT_ID)).to.be.revertedWith("No revenue to withdraw");
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await expect(ticketNFT.connect(hacker).withdraw(EVENT_ID)).to.be.revertedWith("Not the event organizer");
        });
    });

    describe("Terms locked once sales start", function () {
        it("allows changing terms and royalty before the first sale", async function () {
            await openSale();
            await ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE * 2n, 50, 0, URI);
            await ticketNFT.setRoyaltyPercentage(EVENT_ID, 1000);
            expect((await ticketNFT.eventSales(EVENT_ID)).price).to.equal(PRICE * 2n);
        });

        it("locks sale terms and royalty after the first sale", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);

            await expect(
                ticketNFT.connect(organizer).configureSale(EVENT_ID, PRICE * 2n, 100, RESALE_CAP, URI)
            ).to.be.revertedWith("Sale terms locked: tickets already sold");
            await expect(
                ticketNFT.setRoyaltyPercentage(EVENT_ID, 1000)
            ).to.be.revertedWith("Royalty locked: tickets already sold");
        });

        it("still allows pausing and resuming sales after the first sale", async function () {
            await openSale();
            await ticketNFT.connect(buyer).buyTicket(EVENT_ID);
            await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, false);
            await ticketNFT.connect(organizer).setSaleActive(EVENT_ID, true);
            await ticketNFT.connect(buyer2).buyTicket(EVENT_ID);
            expect((await ticketNFT.eventSales(EVENT_ID)).sold).to.equal(2);
        });
    });
});