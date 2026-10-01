import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Upgrades", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, attendee: any, hacker: any;

    beforeEach(async function () {
        [admin, organizer, attendee, hacker] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const mockUSDC = await MockUSDC.deploy();

        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        ticketNFT = await upgrades.deployProxy(
            TicketNFTFactory,
            [admin.address, await mockUSDC.getAddress()],
            { kind: "uups" }
        );

        // Create some state before upgrading, so we can check it survives
        await ticketNFT.grantRole(await ticketNFT.ORGANIZER_ROLE(), organizer.address);
        await ticketNFT
            .connect(organizer)
            .mintTicket(attendee.address, "ipfs://ticket-1", 1, 0);
    });

    it("keeps the same address and all existing data after an upgrade", async function () {
        const proxyAddress = await ticketNFT.getAddress();

        const V2 = await ethers.getContractFactory("TicketNFTV2Mock");
        const upgraded = await upgrades.upgradeProxy(proxyAddress, V2);

        // Same address users and the backend already know
        expect(await upgraded.getAddress()).to.equal(proxyAddress);

        // Existing data is untouched
        expect(await upgraded.ownerOf(0)).to.equal(attendee.address);
        expect(await upgraded.tokenURI(0)).to.equal("ipfs://ticket-1");
        expect(await upgraded.tokenEventId(0)).to.equal(1n);
        expect(
            await upgraded.hasRole(await upgraded.ORGANIZER_ROLE(), organizer.address)
        ).to.equal(true);

        // New logic is live
        expect(await upgraded.version()).to.equal("v2");
    });

    it("rejects upgrades from non-admin accounts", async function () {
        const V2 = await ethers.getContractFactory("TicketNFTV2Mock", hacker);

        await expect(
            upgrades.upgradeProxy(await ticketNFT.getAddress(), V2)
        ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("passes OpenZeppelin's storage layout safety check", async function () {
        const V2 = await ethers.getContractFactory("TicketNFTV2Mock");

        // Throws if V2 would corrupt existing storage (e.g. reordered variables)
        await upgrades.validateUpgrade(await ticketNFT.getAddress(), V2);
    });

    describe("Upgrade lock (before public sale)", function () {
        it("starts unlocked", async function () {
            expect(await ticketNFT.upgradesLocked()).to.equal(false);
        });

        it("blocks all upgrades after lockUpgrades()", async function () {
            await expect(ticketNFT.lockUpgrades())
                .to.emit(ticketNFT, "UpgradesLocked")
                .withArgs(admin.address);
            expect(await ticketNFT.upgradesLocked()).to.equal(true);

            const V2 = await ethers.getContractFactory("TicketNFTV2Mock");
            await expect(
                upgrades.upgradeProxy(await ticketNFT.getAddress(), V2)
            ).to.be.revertedWith("Upgrades are locked");
        });

        it("only the admin can lock upgrades", async function () {
            await expect(
                ticketNFT.connect(hacker).lockUpgrades()
            ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
        });

        it("cannot be locked twice", async function () {
            await ticketNFT.lockUpgrades();
            await expect(ticketNFT.lockUpgrades()).to.be.revertedWith("Upgrades already locked");
        });

        it("keeps the admin's other powers after locking", async function () {
            await ticketNFT.lockUpgrades();
            await expect(ticketNFT.setRoyaltyPercentage(1, 500)).to.not.be.reverted;
        });
    });
});