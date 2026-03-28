import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Role-Based Access Control", function () {
    let ticketNFT: any;
    let admin: any, organizer: any, scanner: any, hacker: any;

    beforeEach(async function () {
        [admin, organizer, scanner, hacker] = await ethers.getSigners();
        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        ticketNFT = await upgrades.deployProxy(TicketNFTFactory, [admin.address], { kind: "uups" });
    });

    it("Should have correctly defined roles", async function () {
        const ORGANIZER_ROLE = ethers.id("ORGANIZER_ROLE");
        const SCANNER_ROLE = ethers.id("SCANNER_ROLE");
    
        expect(await ticketNFT.ORGANIZER_ROLE()).to.equal(ORGANIZER_ROLE);
        expect(await ticketNFT.SCANNER_ROLE()).to.equal(SCANNER_ROLE);
    });

    it("Should allow admin to grant roles", async function () {
        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        expect(await ticketNFT.hasRole(ORGANIZER_ROLE, organizer.address)).to.be.true;
    });

    it("Should restrict minting to organizers only and reject hackers", async function () {
        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);

        
        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test-uri", 1, 0);

        await expect(ticketNFT.connect(hacker).mintTicket(hacker.address, "ipfs://hacker-uri", 1, 0)).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
    });

    it("Should restrict check-in to scanners and reject hackers", async function () {
        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        const SCANNER_ROLE = await ticketNFT.SCANNER_ROLE();

        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        await ticketNFT.grantRole(SCANNER_ROLE, scanner.address);

        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test-uri", 1, 0);

        await expect(ticketNFT.connect(hacker).checkInTicket(0)).to.be.revertedWith("Not authorized to check in");

        await expect(ticketNFT.connect(scanner).checkInTicket(0)).to.emit(ticketNFT, "TicketCheckedIn").withArgs(0, scanner.address);

        expect(await ticketNFT.isUsed(0)).to.be.true;
    });

    it("Should allow Admin and Organizer to check in tickets", async function () {
        const ORGANIZER_ROLE = ethers.id("ORGANIZER_ROLE");
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test1", 1, 0);
        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test2", 1, 0);

        await expect(ticketNFT.connect(organizer).checkInTicket(0))
        .to.emit(ticketNFT, "TicketCheckedIn")
        .withArgs(0, organizer.address);
        await expect(ticketNFT.connect(admin).checkInTicket(1))
        .to.emit(ticketNFT, "TicketCheckedIn")
        .withArgs(1, admin.address);
  });

  it("Should prevent double check-ins", async function () {
        const ORGANIZER_ROLE = ethers.id("ORGANIZER_ROLE");
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);
        
        await ticketNFT.connect(organizer).mintTicket(admin.address, "ipfs://test", 1, 0);
        
        await ticketNFT.connect(organizer).checkInTicket(0);
        await expect(ticketNFT.connect(organizer).checkInTicket(0))
        .to.be.revertedWith("Ticket already used");
  });

  it("Should revert when checking in a non-existent ticket", async function () {
        const SCANNER_ROLE = ethers.id("SCANNER_ROLE");
        await ticketNFT.grantRole(SCANNER_ROLE, scanner.address);
        await expect(ticketNFT.connect(scanner).checkInTicket(999))
        .to.be.reverted;
    });
});
