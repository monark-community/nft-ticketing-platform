import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Batch Minting", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, hacker: any, user1: any, user2: any, user3: any;

    beforeEach(async function () {
        [admin, organizer, hacker, user1, user2, user3] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const mockUSDC = await MockUSDC.deploy();

        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        ticketNFT = await upgrades.deployProxy(
            TicketNFTFactory,
            [admin.address, await mockUSDC.getAddress()],
            { kind: "uups" }
        );

        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
    });

    it("Should successfully batch mint multiple tickets", async function () {
        const recipients = [user1.address, user2.address, user3.address];
        const tokenURIs = ["ipfs://uri1", "ipfs://uri2", "ipfs://uri3"];
        const maxPrices = [0, 0, 0];

        await ticketNFT.connect(organizer).batchMint(recipients, tokenURIs, maxPrices, 1);

        expect(await ticketNFT.ownerOf(0)).to.equal(user1.address);
        expect(await ticketNFT.ownerOf(1)).to.equal(user2.address);
        expect(await ticketNFT.ownerOf(2)).to.equal(user3.address);
    });

    it("Should emit TicketMinted event for each token in batch", async function () {
        const recipients = [user1.address, user2.address];
        const tokenURIs = ["ipfs://uri1", "ipfs://uri2"];
        const maxPrices = [0, 0];

        await expect(ticketNFT.connect(organizer).batchMint(recipients, tokenURIs, maxPrices, 1))
            .to.emit(ticketNFT, "TicketMinted").withArgs(0, 1, user1.address, "ipfs://uri1")
            .and.to.emit(ticketNFT, "TicketMinted").withArgs(1, 1, user2.address, "ipfs://uri2");
    });

    it("Should correctly assign tokenURI and eventId for all minted tokens", async function () {
        const recipients = [user1.address, user2.address];
        const tokenURIs = ["ipfs://uri1", "ipfs://uri2"];
        const maxPrices = [0, 0];

        await ticketNFT.connect(organizer).batchMint(recipients, tokenURIs, maxPrices, 5);

        expect(await ticketNFT.tokenURI(0)).to.equal("ipfs://uri1");
        expect(await ticketNFT.tokenURI(1)).to.equal("ipfs://uri2");
        expect(await ticketNFT.tokenEventId(0)).to.equal(5);
        expect(await ticketNFT.tokenEventId(1)).to.equal(5);
    });

    it("Should correctly set max resale prices per token", async function () {
        const recipients = [user1.address, user2.address];
        const tokenURIs = ["ipfs://uri1", "ipfs://uri2"];
        const maxPrices = [100, 0];

        await ticketNFT.connect(organizer).batchMint(recipients, tokenURIs, maxPrices, 1);

        expect(await ticketNFT.maxResalePrice(0)).to.equal(100);
        expect(await ticketNFT.maxResalePrice(1)).to.equal(0);
    });

    it("Should revert if hacker tries to batch mint", async function () {
        await expect(
            ticketNFT.connect(hacker).batchMint([user1.address], ["ipfs://uri1"], [0], 1)
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("Should revert if array lengths do not match", async function () {
        await expect(
            ticketNFT.connect(organizer).batchMint(
                [user1.address, user2.address],
                ["ipfs://uri1"],
                [0, 0],
                1
            )
        ).to.be.revertedWith("Array lengths must match");
    });

    it("Should revert if batch size is zero", async function () {
        await expect(
            ticketNFT.connect(organizer).batchMint([], [], [], 1)
        ).to.be.revertedWith("Must mint at least one ticket");
    });

    it("Should revert if batch size exceeds 100", async function () {
        const recipients = Array(101).fill(user1.address);
        const tokenURIs = Array(101).fill("ipfs://uri");
        const maxPrices = Array(101).fill(0);

        await expect(
            ticketNFT.connect(organizer).batchMint(recipients, tokenURIs, maxPrices, 1)
        ).to.be.revertedWith("Batch size cannot exceed 100");
    });
});