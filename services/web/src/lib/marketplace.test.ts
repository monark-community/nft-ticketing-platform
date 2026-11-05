import { describe, expect, it } from "vitest";

import {
  appendListings,
  capShare,
  DEFAULT_FILTERS,
  estimateResaleGas,
  formatBps,
  getResaleBlockMessage,
  getResaleBuyBlock,
  hasActiveFilters,
  isCollectible,
  listingsPath,
  parsePrice,
  priceOverCap,
  royaltySplit,
  sellableTickets,
  toUnits,
  walletLimitLabel,
  type Listing,
  type ResaleBuyInput,
  type SellableTicket,
} from "@/lib/marketplace";

// Marketplace rules (#295). USDC has 6 decimals.
const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));
const ZERO = "0x0000000000000000000000000000000000000000";
const SELLER = "0x8f4c000000000000000000000000000000007a12";
const BUYER = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";

describe("listingsPath", () => {
  it("sends the sort and paging, and leaves empty filters out", () => {
    expect(listingsPath(DEFAULT_FILTERS, 1, 9)).toBe("/api/listings?page=1&limit=9&sort=price_asc");
  });

  it("adds the search, event, category and seller", () => {
    const path = listingsPath({ q: "  gala ", eventId: "e1", category: "Concerts", sort: "newest" }, 2, 9, SELLER);
    expect(path).toBe(`/api/listings?page=2&limit=9&sort=newest&q=gala&event_id=e1&category=Concerts&seller=${SELLER}`);
  });

  it("knows when a filter is set", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "newest" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, q: "gala" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, category: "Concerts" })).toBe(true);
  });
});

describe("appendListings", () => {
  it("skips listings already shown", () => {
    const listing = (token_id: string) => ({ token_id }) as Listing;
    expect(appendListings([listing("1"), listing("2")], [listing("2"), listing("3")]).map((l) => l.token_id)).toEqual(["1", "2", "3"]);
  });
});

describe("toUnits", () => {
  it("converts the API's decimal strings", () => {
    expect(toUnits("22", 6)).toBe(usdc(22));
    expect(toUnits("15.50000000", 6)).toBe(usdc(15.5));
    expect(toUnits("0.123456789", 6)).toBe(BigInt(123456));
    expect(toUnits(null, 6)).toBe(BigInt(0));
    expect(toUnits("not a number", 6)).toBe(BigInt(0));
  });
});

describe("parsePrice", () => {
  it("reads a price in USDC", () => {
    expect(parsePrice("22", 6)).toEqual({ ok: true, value: usdc(22) });
    expect(parsePrice(" 22.50 ", 6)).toEqual({ ok: true, value: usdc(22.5) });
    expect(parsePrice("22.", 6)).toEqual({ ok: true, value: usdc(22) });
  });

  it("says nothing about an empty field", () => {
    expect(parsePrice("", 6)).toEqual({ ok: false, error: null });
  });

  it("rejects zero, text and too many decimals", () => {
    expect(parsePrice("0", 6)).toEqual({ ok: false, error: "The price must be more than 0." });
    expect(parsePrice("abc", 6)).toMatchObject({ ok: false });
    expect(parsePrice("-5", 6)).toMatchObject({ ok: false });
    expect(parsePrice("1.1234567", 6)).toEqual({ ok: false, error: "Enter a price in USDC, with up to 6 decimals." });
  });
});

describe("royaltySplit", () => {
  it("takes the royalty from the price, like the contract", () => {
    expect(royaltySplit(usdc(22), 1000)).toEqual({ royalty: usdc(2.2), sellerReceives: usdc(19.8) });
    expect(royaltySplit(usdc(22), 0)).toEqual({ royalty: BigInt(0), sellerReceives: usdc(22) });
  });

  it("rounds the royalty down, so the seller gets the remainder", () => {
    expect(royaltySplit(BigInt(999), 1000)).toEqual({ royalty: BigInt(99), sellerReceives: BigInt(900) });
  });

  it("formats basis points", () => {
    expect(formatBps(1000)).toBe("10%");
    expect(formatBps(250)).toBe("2.5%");
  });
});

describe("price cap", () => {
  it("shows how much of the cap the price uses", () => {
    expect(capShare(usdc(22), usdc(30))).toBe(73.33);
    expect(capShare(usdc(30), usdc(30))).toBe(100);
    expect(capShare(usdc(22), null)).toBeNull();
  });

  it("only blocks a price over the cap while the cap applies", () => {
    expect(priceOverCap(usdc(31), true, usdc(30))).toBe(true);
    expect(priceOverCap(usdc(30), true, usdc(30))).toBe(false);
    expect(priceOverCap(usdc(500), false, usdc(30))).toBe(false);
  });
});

describe("tickets to sell", () => {
  const ticket = (over: Partial<SellableTicket> & { sales_end_at?: string | null; contract_event_id?: string | null }): SellableTicket =>
    ({
      token_id: "1",
      status: "VALID",
      ...over,
      event: { contract_event_id: "contract_event_id" in over ? over.contract_event_id : "5", sales_end_at: over.sales_end_at ?? "2030-01-01T00:00:00Z" },
    }) as SellableTicket;
  const now = new Date("2027-01-01T00:00:00Z").getTime();

  it("marks used tickets and tickets after the event as collectibles", () => {
    expect(isCollectible(ticket({}), now)).toBe(false);
    expect(isCollectible(ticket({ status: "USED" }), now)).toBe(true);
    expect(isCollectible(ticket({ sales_end_at: "2026-12-31T00:00:00Z" }), now)).toBe(true);
  });

  it("only offers tickets of events on-chain", () => {
    expect(sellableTickets([ticket({ token_id: "1" }), ticket({ token_id: "2", contract_event_id: null })]).map((t) => t.token_id)).toEqual(["1"]);
  });
});

describe("getResaleBuyBlock", () => {
  const ready: ResaleBuyInput = {
    listing: { seller: SELLER, price: usdc(22), royaltyBps: 1000 },
    currentRoyaltyBps: 1000,
    capApplies: true,
    maxPrice: usdc(30),
    isConnected: true,
    onContractChain: true,
    wallet: BUYER,
    signedIn: true,
    profileComplete: true,
    perWalletLimit: 4,
    held: 2,
    usdcBalance: usdc(100),
    ethBalance: BigInt(10) ** BigInt(18),
    ethNeeded: BigInt(10) ** BigInt(14),
  };

  it("lets a ready buyer through", () => {
    expect(getResaleBuyBlock(ready)).toBeNull();
  });

  it.each([
    ["notListed", { listing: { seller: ZERO, price: BigInt(0), royaltyBps: 0 } }],
    ["ownListing", { wallet: SELLER.toUpperCase().replace("0X", "0x") }],
    ["royaltyChanged", { currentRoyaltyBps: 500 }],
    ["overCap", { maxPrice: usdc(20) }],
    ["notConnected", { isConnected: false, wallet: undefined }],
    ["wrongNetwork", { onContractChain: false }],
    ["notSignedIn", { signedIn: false }],
    ["profileIncomplete", { profileComplete: false }],
    ["walletLimit", { held: 4 }],
    ["notEnoughUsdc", { usdcBalance: usdc(21.99) }],
    ["notEnoughEth", { ethBalance: BigInt(1) }],
  ] as const)("blocks with %s", (reason, change) => {
    expect(getResaleBuyBlock({ ...ready, ...change })?.reason).toBe(reason);
  });

  it("checks the listing before the wallet, so anyone sees a sold ticket", () => {
    expect(getResaleBuyBlock({ ...ready, listing: { seller: ZERO, price: BigInt(0), royaltyBps: 0 }, isConnected: false })?.reason).toBe("notListed");
  });

  it("ignores the cap when it no longer applies (collectible)", () => {
    expect(getResaleBuyBlock({ ...ready, capApplies: false, maxPrice: BigInt(0) })).toBeNull();
  });

  it("allows any number of tickets when the event has no wallet limit", () => {
    expect(getResaleBuyBlock({ ...ready, perWalletLimit: 0, held: 50 })).toBeNull();
  });

  it("says what to do next", () => {
    const message = getResaleBlockMessage({ reason: "notEnoughUsdc", total: usdc(22), balance: usdc(10) }, { usdcDecimals: 6, chainName: "Sepolia" });
    expect(message.message).toBe("This ticket costs 22.00 USDC and your wallet has 10.00 USDC. Add 12.00 USDC to buy it.");
    expect(getResaleBlockMessage({ reason: "wrongNetwork" }, { usdcDecimals: 6, chainName: "Sepolia" }).message).toContain("Sepolia");
  });
});

describe("wallet limit and fees", () => {
  it("shows the tickets held after this purchase", () => {
    expect(walletLimitLabel(4, 2)).toBe("3 of 4");
    expect(walletLimitLabel(4, null)).toBe("4 per wallet");
    expect(walletLimitLabel(0, 2)).toBe("No limit");
  });

  it("adds the approval to the gas estimate only when needed", () => {
    expect(estimateResaleGas(true)).toBeGreaterThan(estimateResaleGas(false));
  });
});
