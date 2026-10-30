import { describe, expect, it } from "vitest";
import {
  buildTiers,
  eventImageUrl,
  formatDuration,
  formatEventDate,
  formatMultiplier,
  formatPercent,
  type ApiTicketType,
} from "@/lib/event-details";
import { formatEth, formatTokenAmount } from "@/lib/token-amount";
import { getStockStatus, percentRemaining, ticketsRemaining } from "@/lib/ticket-stock";

// Event page helpers (#284): joining API and contract data, and what the page displays.

const apiType = (id: string, name: string, created_at: string): ApiTicketType => ({
  id,
  event_id: "event-1",
  name,
  description: `${name} description`,
  price: "15",
  supply: 100,
  sold: 0,
  created_at,
});

// Returned out of order on purpose: the API doesn't sort them
const API_TYPES = [
  apiType("vip", "VIP", "2026-10-01T10:00:01.000Z"),
  apiType("ga", "General Admission", "2026-10-01T10:00:00.000Z"),
];

describe("buildTiers", () => {
  it("matches API names to on-chain types by creation order (until #216)", () => {
    const tiers = buildTiers(
      API_TYPES,
      [
        { typeId: 0, price: BigInt(15_000_000), maxSupply: 1000, sold: 2, issued: 0 },
        { typeId: 1, price: BigInt(28_000_000), maxSupply: 300, sold: 0, issued: 5 },
      ],
      6,
    );
    expect(tiers.map((t) => [t.typeId, t.name, t.price, t.remaining])).toEqual([
      [0, "General Admission", BigInt(15_000_000), 998],
      [1, "VIP", BigInt(28_000_000), 295],
    ]);
  });

  it("names an on-chain type the API doesn't know about", () => {
    const tiers = buildTiers([], [{ typeId: 0, price: BigInt(1), maxSupply: 1, sold: 0, issued: 0 }], 6);
    expect(tiers[0].name).toBe("Ticket type 1");
  });

  it("falls back to the API's types when the event isn't on-chain yet", () => {
    const tiers = buildTiers(API_TYPES, null, 6);
    expect(tiers.map((t) => [t.name, t.price])).toEqual([
      ["General Admission", BigInt(15_000_000)],
      ["VIP", BigInt(15_000_000)],
    ]);
  });
});

describe("display helpers", () => {
  it("formats the event date like the hero", () => {
    expect(formatEventDate("2027-03-06T23:00:00.000Z", "America/Toronto")).toBe("Sat, Mar 6, 2027 • 6:00 PM");
  });

  it.each([
    ["2027-03-06T23:00:00Z", "2027-03-07T02:00:00Z", "3h"],
    ["2027-03-06T23:00:00Z", "2027-03-07T01:15:00Z", "2h 15m"],
    ["2027-03-06T23:00:00Z", "2027-03-06T23:45:00Z", "45m"],
    ["2027-03-06T23:00:00Z", null, null],
    ["2027-03-06T23:00:00Z", "2027-03-06T22:00:00Z", null],
  ])("formats the duration from %s to %s", (start, end, expected) => {
    expect(formatDuration(start, end)).toBe(expected);
  });

  it("turns ipfs:// images into gateway URLs and keeps normal URLs", () => {
    expect(eventImageUrl("ipfs://bafy123")).toBe("https://gateway.pinata.cloud/ipfs/bafy123");
    expect(eventImageUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(eventImageUrl(null)).toBeNull();
  });

  it("formats the resale cap and royalty from basis points", () => {
    expect(formatMultiplier(20_000)).toBe("2×");
    expect(formatMultiplier(15_000)).toBe("1.5×");
    expect(formatPercent(1_000)).toBe("10%");
    expect(formatPercent(250)).toBe("2.5%");
  });

  it("formats USDC and ETH amounts", () => {
    expect(formatTokenAmount(BigInt(15_000_000), 6)).toBe("15.00");
    expect(formatTokenAmount(BigInt(1_450_000_000), 6)).toBe("1,450.00");
    expect(formatEth(BigInt(400_000_000_000_000))).toBe("0.0004");
    expect(formatEth(BigInt(1_000))).toBe("<0.0001");
  });
});

describe("stock", () => {
  it("counts sold and organizer-issued tickets", () => {
    expect(ticketsRemaining({ maxSupply: 10, sold: 3, issued: 2 })).toBe(5);
    expect(ticketsRemaining({ maxSupply: 2, sold: 2, issued: 1 })).toBe(0);
  });

  it.each([
    [0, 300, "soldOut"],
    [95, 300, "low"],
    [105, 300, "low"],
    [106, 300, "available"],
  ] as const)("%i of %i left is %s", (remaining, supply, status) => {
    expect(getStockStatus(remaining, supply)).toBe(status);
  });

  it("gives the share remaining with one decimal", () => {
    expect(percentRemaining(255, 1450)).toBe(17.6);
    expect(percentRemaining(0, 0)).toBe(0);
  });
});
