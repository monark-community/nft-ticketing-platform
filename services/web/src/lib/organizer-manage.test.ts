import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  addScanner,
  addToWhitelist,
  explorerAddressUrl,
  fetchEventTickets,
  fetchOrganizerEvent,
  fetchScanners,
  fetchWhitelist,
  formatTicketPrice,
  manageApiErrorMessage,
  MAX_BATCH_SIZE,
  parseWalletList,
  removeFromWhitelist,
  removeScanner,
  ticketsLeft,
  walletsMissingFrom,
  type TicketQuery,
} from "@/lib/organizer-manage";

// Organizer manage page (#189-#194): API paths, wallet-list rules and display helpers.

const EVENT = "event id/1";
const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OTHER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const ZERO = "0x0000000000000000000000000000000000000000";

interface Call {
  path: string;
  options?: { method?: string; data?: unknown };
}

function recorder<T>(result: T) {
  const calls: Call[] = [];
  const request = async <R>(path: string, options?: { method?: string; data?: unknown }): Promise<R> => {
    calls.push({ path, options });
    return result as unknown as R;
  };
  return { calls, request };
}

describe("event API calls", () => {
  it("loads the event and its tickets with filters", async () => {
    const { calls, request } = recorder({ tickets: [], summary: {}, total: 0, page: 1, limit: 10 });

    await fetchOrganizerEvent(EVENT, request);
    await fetchEventTickets(
      EVENT,
      { page: 2, limit: 10, status: "USED", kind: "issued", ticketTypeId: "type/1" },
      request
    );

    expect(calls[0]).toEqual({ path: "/api/events/event%20id%2F1", options: undefined });
    expect(calls[1].path).toBe(
      "/api/events/event%20id%2F1/tickets?page=2&limit=10&status=USED&kind=issued&ticket_type_id=type%2F1"
    );
  });

  it("leaves out filters that aren't set", async () => {
    const { calls, request } = recorder({ tickets: [], summary: {}, total: 0, page: 1, limit: 10 });
    const query: TicketQuery = {};
    await fetchEventTickets("abc", query, request);
    expect(calls[0].path).toBe("/api/events/abc/tickets");
  });

  it("calls the guest-list endpoints with the right methods", async () => {
    const { calls, request } = recorder([]);
    const encoded = encodeURIComponent(WALLET);

    await fetchWhitelist("e", request);
    await addToWhitelist("e", [WALLET.toLowerCase()], request);
    await removeFromWhitelist("e", WALLET, request);

    expect(calls[0]).toEqual({ path: "/api/events/e/whitelist", options: undefined });
    expect(calls[1]).toEqual({ path: "/api/events/e/whitelist", options: { method: "POST", data: { wallets: [WALLET.toLowerCase()] } } });
    expect(calls[2]).toEqual({ path: `/api/events/e/whitelist/${encoded}`, options: { method: "DELETE" } });
  });

  it("calls the scanner endpoints with the right methods", async () => {
    const { calls, request } = recorder([]);
    const encoded = encodeURIComponent(WALLET);

    await fetchScanners("e", request);
    await addScanner("e", WALLET, request);
    await removeScanner("e", WALLET, request);

    expect(calls[0]).toEqual({ path: "/api/events/e/scanners", options: undefined });
    expect(calls[1]).toEqual({ path: "/api/events/e/scanners", options: { method: "POST", data: { wallet: WALLET } } });
    expect(calls[2]).toEqual({ path: `/api/events/e/scanners/${encoded}`, options: { method: "DELETE" } });
  });
});

describe("parseWalletList", () => {
  it("accepts one address per line or separated by commas and spaces", () => {
    expect(parseWalletList(`${WALLET}\n${OTHER}`)).toEqual({
      wallets: [WALLET.toLowerCase(), OTHER.toLowerCase()],
      duplicates: 0,
      error: null,
    });
    expect(parseWalletList(`${WALLET}, ${OTHER}; ${WALLET}`)).toMatchObject({
      wallets: [WALLET.toLowerCase(), OTHER.toLowerCase()],
      duplicates: 1,
      error: null,
    });
  });

  it("rejects an empty list and invalid or zero addresses", () => {
    expect(parseWalletList("  \n ")).toMatchObject({ wallets: [], error: "Enter at least one wallet address." });
    expect(parseWalletList(`${WALLET}\nnope`)).toMatchObject({ wallets: [], error: '"nope" is not a valid wallet address.' });
    expect(parseWalletList(ZERO)).toMatchObject({ wallets: [], error: expect.stringContaining("zero address") });
  });

  it("counts duplicates once and lowercases every wallet", () => {
    const result = parseWalletList(`${WALLET} ${WALLET.toLowerCase()} ${WALLET.toUpperCase().replace("0X", "0x")}`);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0]).toBe(WALLET.toLowerCase());
    expect(result.duplicates).toBe(2);
  });

  it("caps a batch at the requested size", () => {
    const addresses = Array.from({ length: 3 }, (_, index) => `0x${String(index + 1).padStart(40, "0")}`);
    expect(parseWalletList(addresses.join("\n"), 2)).toMatchObject({
      wallets: addresses.slice(0, 3).map((address) => address.toLowerCase()),
      error: "Add at most 2 wallets at a time.",
    });
    expect(parseWalletList(addresses.join("\n"), MAX_BATCH_SIZE).error).toBeNull();
  });
});

describe("manageApiErrorMessage", () => {
  it("explains the cases the organizer can act on", () => {
    expect(manageApiErrorMessage(new ApiError("incomplete profile", 422))).toContain("finished platform account");
    expect(manageApiErrorMessage(new ApiError("not your event", 403))).toContain("Only this event's organizer");
    expect(manageApiErrorMessage(new ApiError("Server exploded", 500))).toBe("Server exploded");
  });

  it("falls back to a connection message for non-API errors", () => {
    expect(manageApiErrorMessage(new Error("network"))).toContain("Could not reach the server");
    expect(manageApiErrorMessage("nope")).toContain("Could not reach the server");
  });
});

describe("display helpers", () => {
  it("shows a USDC price, or Free for an issued ticket", () => {
    expect(formatTicketPrice(null)).toBe("Free");
    expect(formatTicketPrice("25")).toBe("25.00 USDC");
    expect(formatTicketPrice("25.50000000")).toBe("25.50 USDC");
    expect(formatTicketPrice("not a number")).toBe("not a number USDC");
  });

  it("builds an explorer address link only when the chain has an explorer", () => {
    expect(explorerAddressUrl("https://explorer.example/", WALLET)).toBe(`https://explorer.example/address/${WALLET}`);
    expect(explorerAddressUrl(null, WALLET)).toBeNull();
    expect(explorerAddressUrl(undefined, WALLET)).toBeNull();
  });

  it("counts what's left of a ticket type without going below zero", () => {
    expect(ticketsLeft({ maxSupply: 100, sold: 40, issued: 5 })).toBe(55);
    expect(ticketsLeft({ maxSupply: 10, sold: 9, issued: 9 })).toBe(0);
  });

  it("finds wallets that aren't already on a list, ignoring case", () => {
    expect(walletsMissingFrom([{ wallet: WALLET.toLowerCase() }], [WALLET, OTHER])).toEqual([OTHER]);
    expect(walletsMissingFrom([], [WALLET])).toEqual([WALLET]);
  });
});
