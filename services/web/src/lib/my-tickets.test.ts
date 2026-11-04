import { describe, expect, it } from "vitest";

import type { ApiEvent, ApiTicketType } from "./event-details";
import {
  buildEntryQRData,
  eventHasEnded,
  formatCheckInDate,
  formatTicketDate,
  groupTickets,
  indexEventsByChainId,
  isSignatureRejected,
  parseTicketView,
  qrSecondsLeft,
  ticketCountLabel,
  ticketTypeName,
  typeBadgeLabel,
  typeTone,
  type OwnedTicket,
} from "./my-tickets";
import { buildCheckInMessage } from "./ticket-qr";

const NOW = Date.parse("2026-10-30T12:00:00Z");

function type(name: string, createdAt: string): ApiTicketType {
  return { id: name, event_id: "e", name, description: null, price: "15", supply: 100, sold: 0, created_at: createdAt };
}

function event(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: "event-1",
    organizer_wallet: "0x0",
    title: "Gala Opera Concert",
    description: null,
    location: "National Arts Centre, Ottawa, ON",
    category: null,
    start_date: "2026-11-29T23:00:00Z",
    end_date: "2026-11-30T02:00:00Z",
    image_url: null,
    contract_event_id: "1",
    status: "PUBLISHED",
    // Returned out of order on purpose: names follow creation order
    ticket_types: [type("VIP", "2026-01-02"), type("General Admission", "2026-01-01"), type("Early Bird", "2026-01-03")],
    ...overrides,
  };
}

function ticket(tokenId: number, overrides: Partial<OwnedTicket> = {}): OwnedTicket {
  return { tokenId: BigInt(tokenId), eventId: BigInt(1), typeId: 0, isUsed: false, checkedInAt: null, ...overrides };
}

describe("eventHasEnded", () => {
  it("uses the end date", () => {
    expect(eventHasEnded(event(), NOW)).toBe(false);
    expect(eventHasEnded(event({ end_date: "2026-10-30T11:59:00Z" }), NOW)).toBe(true);
  });

  it("gives events without an end date 12 hours after the start", () => {
    expect(eventHasEnded(event({ start_date: "2026-10-30T01:00:00Z", end_date: null }), NOW)).toBe(false);
    expect(eventHasEnded(event({ start_date: "2026-10-29T23:00:00Z", end_date: null }), NOW)).toBe(true);
  });

  it("never treats a bad date as ended", () => {
    expect(eventHasEnded(event({ start_date: "not a date", end_date: null }), NOW)).toBe(false);
  });
});

describe("indexEventsByChainId", () => {
  it("keys events by their contract event ID and skips events not on-chain", () => {
    const map = indexEventsByChainId([event(), event({ id: "draft", contract_event_id: null })]);
    expect([...map.keys()]).toEqual(["1"]);
    expect(map.get("1")?.id).toBe("event-1");
  });
});

describe("ticketTypeName", () => {
  it("maps the on-chain type ID to the API name by creation order", () => {
    expect(ticketTypeName(event(), 0)).toBe("General Admission");
    expect(ticketTypeName(event(), 2)).toBe("Early Bird");
  });

  it("falls back when the API doesn't have the type or the event", () => {
    expect(ticketTypeName(event(), 5)).toBe("Ticket type 6");
    expect(ticketTypeName(null, 1)).toBe("Ticket type 2");
    expect(ticketTypeName(event(), null)).toBeNull();
  });
});

describe("groupTickets", () => {
  const events = indexEventsByChainId([
    event(),
    event({ id: "event-2", title: "Jazz at the Atrium", contract_event_id: "2", start_date: "2026-12-14T00:00:00Z", end_date: null }),
    event({ id: "old", title: "Autumn Strings", contract_event_id: "3", start_date: "2026-10-10T22:00:00Z", end_date: "2026-10-11T01:00:00Z" }),
  ]);

  it("groups tickets for the same event, type and status, sorted by token ID", () => {
    const { upcoming } = groupTickets([ticket(3), ticket(0), ticket(1, { typeId: 2 }), ticket(2, { typeId: 2 })], events, NOW);
    expect(upcoming.map((g) => [g.typeName, g.tickets.map((t) => Number(t.tokenId))])).toEqual([
      ["General Admission", [0, 3]],
      ["Early Bird", [1, 2]],
    ]);
  });

  it("puts used tickets and tickets for finished events under past", () => {
    const { upcoming, past } = groupTickets(
      [ticket(0), ticket(1, { isUsed: true, checkedInAt: 100 }), ticket(2, { isUsed: true, checkedInAt: 200 }), ticket(9, { eventId: BigInt(3) })],
      events,
      NOW,
    );
    expect(upcoming.map((g) => [g.title, g.status])).toEqual([["Gala Opera Concert", "valid"]]);
    expect(past.map((g) => [g.title, g.status, g.tickets.length])).toEqual([
      ["Gala Opera Concert", "used", 2],
      ["Autumn Strings", "expired", 1],
    ]);
    expect(past[0].checkedInAt).toBe(200);
  });

  it("sorts upcoming soonest first and past most recent first", () => {
    const { upcoming, past } = groupTickets(
      [ticket(1, { eventId: BigInt(2) }), ticket(0), ticket(5, { eventId: BigInt(3) }), ticket(6, { isUsed: true })],
      events,
      NOW,
    );
    expect(upcoming.map((g) => g.title)).toEqual(["Gala Opera Concert", "Jazz at the Atrium"]);
    expect(past.map((g) => g.title)).toEqual(["Gala Opera Concert", "Autumn Strings"]);
  });

  it("still shows tickets when the API doesn't know the event, after the known ones", () => {
    const { upcoming } = groupTickets([ticket(4, { eventId: BigInt(7) }), ticket(0)], events, NOW);
    expect(upcoming.map((g) => [g.title, g.event?.id ?? null, g.typeName])).toEqual([
      ["Gala Opera Concert", "event-1", "General Admission"],
      ["Event #7", null, "Ticket type 1"],
    ]);
  });

  it("works without any event details (API down)", () => {
    const { upcoming, past } = groupTickets([ticket(0), ticket(1, { isUsed: true })], null, NOW);
    expect(upcoming.map((g) => g.title)).toEqual(["Event #1"]);
    expect(past.map((g) => g.status)).toEqual(["used"]);
  });

  it("returns empty sections for no tickets", () => {
    expect(groupTickets([], events, NOW)).toEqual({ upcoming: [], past: [] });
  });
});

describe("labels", () => {
  const [single] = groupTickets([ticket(12)], indexEventsByChainId([event()]), NOW).upcoming;
  const [several] = groupTickets([ticket(0), ticket(3)], indexEventsByChainId([event()]), NOW).upcoming;
  const [unknownType] = groupTickets([ticket(0, { typeId: null }), ticket(1, { typeId: null })], null, NOW).upcoming;

  it("shows the type and the count separately for several tickets", () => {
    expect(typeBadgeLabel(several)).toBe("General Admission");
    expect(ticketCountLabel(several)).toBe("2 tickets");
  });

  it("shows the token ID for a single ticket", () => {
    expect(typeBadgeLabel(single)).toBe("General Admission");
    expect(ticketCountLabel(single)).toBe("Ticket #12");
  });

  it("has no type tag when the type is unknown", () => {
    expect(typeBadgeLabel(unknownType)).toBeNull();
    expect(ticketCountLabel(unknownType)).toBe("2 tickets");
  });
});

describe("typeTone", () => {
  it("gives the first three ticket types white, gold and burgundy, then repeats", () => {
    expect([0, 1, 2, 3, 4].map(typeTone)).toEqual(["white", "gold", "burgundy", "white", "gold"]);
  });

  it("uses white when the type is unknown", () => {
    expect(typeTone(null)).toBe("white");
  });
});

describe("formatTicketDate", () => {
  it("formats upcoming events with the doors time and past ones with the day", () => {
    expect(formatTicketDate("2027-03-06T23:00:00Z", true, "America/Toronto")).toBe("Sat, Mar 6, 2027 · Doors 6:00 PM");
    expect(formatTicketDate("2026-10-10T22:00:00Z", false, "America/Toronto")).toBe("Sat, Oct 10, 2026");
  });

  it("returns null for a bad date", () => {
    expect(formatTicketDate("nope", true)).toBeNull();
  });
});

describe("formatCheckInDate", () => {
  it("formats a unix time as a short date", () => {
    expect(formatCheckInDate(Date.parse("2026-10-10T23:30:00Z") / 1000, "America/Toronto")).toBe("Oct 10, 2026");
  });
});

describe("buildEntryQRData", () => {
  const data = buildEntryQRData({ tokenId: BigInt(4829), eventId: BigInt(1) }, "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", 31337, 1_800_000_000);

  it("uses the given contract and chain, not the wallet's network", () => {
    expect(data).toEqual({
      tokenId: "4829",
      eventId: "1",
      contractAddress: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      chainId: 31337,
      timestamp: 1_800_000_000,
    });
  });

  it("keeps the check-in message format the scanner expects", () => {
    expect(buildCheckInMessage(data)).toBe(
      "NFTOKENPASS check-in | contract: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 | chain: 31337 | token: 4829 | event: 1 | time: 1800000000",
    );
  });
});

describe("qrSecondsLeft", () => {
  it("counts down from 60 seconds and stops at 0", () => {
    expect(qrSecondsLeft(1000, 1000)).toBe(60);
    expect(qrSecondsLeft(1000, 1018)).toBe(42);
    expect(qrSecondsLeft(1000, 1060)).toBe(0);
    expect(qrSecondsLeft(1000, 1500)).toBe(0);
  });

  it("never shows more than 60 seconds if the clock moved back", () => {
    expect(qrSecondsLeft(1000, 900)).toBe(60);
  });
});

describe("isSignatureRejected", () => {
  it("recognises a rejection however the wallet reports it", () => {
    expect(isSignatureRejected({ name: "UserRejectedRequestError" })).toBe(true);
    expect(isSignatureRejected({ code: 4001 })).toBe(true);
    expect(isSignatureRejected(new Error("MetaMask Tx Signature: User denied message signature."))).toBe(true);
    expect(isSignatureRejected({ name: "SignMessageError", cause: { cause: { code: 4001 } } })).toBe(true);
  });

  it("treats other failures as errors", () => {
    expect(isSignatureRejected(new Error("Connector not connected."))).toBe(false);
    expect(isSignatureRejected(null)).toBe(false);
    expect(isSignatureRejected("rejected")).toBe(false);
  });
});

describe("parseTicketView", () => {
  it("accepts list and falls back to grid", () => {
    expect(parseTicketView("list")).toBe("list");
    expect(parseTicketView("grid")).toBe("grid");
    expect(parseTicketView(null)).toBe("grid");
    expect(parseTicketView("<script>")).toBe("grid");
  });
});
