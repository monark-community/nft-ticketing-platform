import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Issue #4: Role-Based Access Control", function () {
  let ticketNFT: any;
  let admin: any, organizer: any, scanner: any, hacker: any;
  
  // Set up a fresh contract instance and test accounts before each test
  beforeEach(async function () {
    [admin, organizer, scanner, hacker] = await ethers.getSigners();
    const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
    ticketNFT = await upgrades.deployProxy(TicketNFTFactory, [admin.address], { kind: "uups" });
  });
  
  // Test cases for role-based access control
  it("Should have correctly defined roles", async function () {
    const ORGANIZER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ORGANIZER_ROLE"));
    const SCANNER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SCANNER_ROLE"));
    expect(await ticketNFT.ORGANIZER_ROLE()).to.equal(ORGANIZER_ROLE);
    expect(await ticketNFT.SCANNER_ROLE()).to.equal(SCANNER_ROLE);
  });
 
  // Test that only organizers can mint tickets and scanners can check in tickets
  it("Should restrict minting to organizers only", async function () {
    const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
    await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);

    await ticketNFT.connect(organizer).mintTicket(
        admin.address,        
        1,                     
        "ipfs://test-metadata", 
        0                      
    );

    await expect(
        ticketNFT.connect(hacker).mintTicket(hacker.address, 1, "uri", 0)
    ).to.be.revertedWithCustomError(ticketNFT, "AccessControlUnauthorizedAccount");
  });

  // Test that only scanners can check in tickets
  it("Should restrict check-in to scanners", async function () {
    const SCANNER_ROLE = await ticketNFT.SCANNER_ROLE();
    const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
    
    await ticketNFT.grantRole(SCANNER_ROLE, scanner.address);
    await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);

    await ticketNFT.connect(organizer).mintTicket(admin.address, 1, "uri", 0);

    await expect(ticketNFT.connect(scanner).checkInTicket(1))
      .to.not.be.reverted;
    
    expect(await ticketNFT.isUsed(1)).to.be.true;
  });
});