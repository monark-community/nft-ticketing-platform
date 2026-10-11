import { ethers, upgrades } from "hardhat";

const ONE_WEEK = 7 * 24 * 60 * 60;

/** Deploys MockUSDC and the TicketNFT proxy, with `admin` as the contract admin. */
export async function deployTicketNFT(admin: any) {
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    const TicketNFT = await ethers.getContractFactory("TicketNFT");
    const ticketNFT: any = await upgrades.deployProxy(
        TicketNFT,
        [admin.address, await usdc.getAddress()],
        { kind: "uups" }
    );

    return { ticketNFT, usdc };
}

/** A unix timestamp `seconds` after the latest block (default: one week). */
export async function futureTime(seconds = ONE_WEEK): Promise<bigint> {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(block!.timestamp + seconds);
}

/**
 * Configures an event and adds one ticket type (type 0).
 * Defaults: free tickets, supply 100, no royalty, no resale cap, no per-wallet limit, ends in one week.
 */
export async function setupEvent(
    ticketNFT: any,
    organizer: any,
    eventId: number,
    options: { price?: bigint; maxSupply?: number; royaltyBps?: number; resaleCapBps?: number; perWalletLimit?: number; endTime?: bigint } = {}
) {
    const endTime = options.endTime ?? (await futureTime());
    await ticketNFT
        .connect(organizer)
        .configureEvent(eventId, endTime, options.royaltyBps ?? 0, options.resaleCapBps ?? 0, options.perWalletLimit ?? 0);
    await ticketNFT
        .connect(organizer)
        .addTicketType(eventId, options.price ?? 0n, options.maxSupply ?? 100, `ipfs://event-${eventId}-type-0`);
}
