import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("TicketNFT - Resale Rules & Royalties", function () {
    let ticketNFT: any;
    let mockUSDC: any;
    let admin: any, organizer: any, seller: any, buyer: any, hacker: any;

    beforeEach(async function () {
        [admin, organizer, seller, buyer, hacker] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        mockUSDC = await MockUSDC.deploy();

        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        ticketNFT = await upgrades.deployProxy(
            TicketNFTFactory,
            [admin.address, await mockUSDC.getAddress()],
            { kind: "uups" }
        );

        const ORGANIZER_ROLE = await ticketNFT.ORGANIZER_ROLE();
        await ticketNFT.grantRole(ORGANIZER_ROLE, organizer.address);

        await mockUSDC.mint(buyer.address, ethers.parseUnits("1000", 6));

        await ticketNFT.connect(organizer).mintTicket(
            seller.address,
            "ipfs://test",
            1,
            ethers.parseUnits("200", 6)
        );
    });

    it("Should successfully resell a ticket", async function () {
        const salePrice = ethers.parseUnits("100", 6);

        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);
        await ticketNFT.connect(seller).resell(0, buyer.address, salePrice);

        expect(await ticketNFT.ownerOf(0)).to.equal(buyer.address);
    });

    it("Should pay royalty to organizer and remainder to seller", async function () {
        const salePrice = ethers.parseUnits("100", 6);
        const royaltyBps = 1000;

        await ticketNFT.connect(admin).setRoyaltyPercentage(1, royaltyBps);

        const sellerBalanceBefore = await mockUSDC.balanceOf(seller.address);
        const organizerBalanceBefore = await mockUSDC.balanceOf(organizer.address);

        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);
        await ticketNFT.connect(seller).resell(0, buyer.address, salePrice);

        const expectedRoyalty = salePrice * BigInt(royaltyBps) / BigInt(10000);
        const expectedSellerAmount = salePrice - expectedRoyalty;

        expect(await mockUSDC.balanceOf(seller.address)).to.equal(sellerBalanceBefore + expectedSellerAmount);
        expect(await mockUSDC.balanceOf(organizer.address)).to.equal(organizerBalanceBefore + expectedRoyalty);
    });

    it("Should revert if sale price exceeds max resale price", async function () {
        const salePrice = ethers.parseUnits("300", 6);

        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);

        await expect(
            ticketNFT.connect(seller).resell(0, buyer.address, salePrice)
        ).to.be.revertedWith("Sale price exceeds maximum resale price");
    });

    it("Should revert if caller does not own the ticket", async function () {
        const salePrice = ethers.parseUnits("100", 6);

        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);

        await expect(
            ticketNFT.connect(hacker).resell(0, buyer.address, salePrice)
        ).to.be.revertedWith("You do not own this ticket");
    });

    it("Should revert if ticket is already used", async function () {
        const salePrice = ethers.parseUnits("100", 6);

        await ticketNFT.connect(organizer).checkInTicket(0);

        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);

        await expect(
            ticketNFT.connect(seller).resell(0, buyer.address, salePrice)
        ).to.be.revertedWith("Cannot resell a used ticket");
    });

    it("Should revert if buyer address is zero", async function () {
        const salePrice = ethers.parseUnits("100", 6);

        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);

        await expect(
            ticketNFT.connect(seller).resell(0, ethers.ZeroAddress, salePrice)
        ).to.be.revertedWith("Invalid buyer address");
    });

    it("Should emit TicketResold event", async function () {
        const salePrice = ethers.parseUnits("100", 6);

        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);

        await expect(ticketNFT.connect(seller).resell(0, buyer.address, salePrice))
            .to.emit(ticketNFT, "TicketResold")
            .withArgs(0, seller.address, buyer.address, salePrice);
    });

    it("Should allow resell with no price cap set", async function () {
        await ticketNFT.connect(organizer).mintTicket(
            seller.address,
            "ipfs://test2",
            1,
            0
        );

        const salePrice = ethers.parseUnits("999", 6);
        await mockUSDC.connect(buyer).approve(await ticketNFT.getAddress(), salePrice);

        await expect(
            ticketNFT.connect(seller).resell(1, buyer.address, salePrice)
        ).to.not.be.reverted;
    });
});