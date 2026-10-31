import { describe, expect, it } from "vitest";

import {
  defaultSaleRules,
  detailsFromEvent,
  EMPTY_DETAILS,
  eventEndMs,
  formatEventWhen,
  fromLocalInput,
  localInputFromMs,
  newTicketType,
  parsePrice,
  parseRoyaltyBps,
  parseStep,
  parseStoredSaleRules,
  planTicketTypeSync,
  resaleExample,
  ticketTotals,
  ticketTypeFromApi,
  toChainSettings,
  toEventPayload,
  toLocalInput,
  toTicketTypePayload,
  validateCoverImage,
  validateDetails,
  validateSaleRules,
  validateTicketTypes,
  type DetailsForm,
  type SaleRulesForm,
  type TicketTypeForm,
} from "@/lib/create-event";
import type { ApiEvent, ApiTicketType } from "@/lib/event-details";
import { formatTokenAmount } from "@/lib/token-amount";

// Create event form rules (#187, #188).

const NOW = new Date("2026-11-01T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Local datetime-local values N hours from NOW, so the tests pass in any time zone
const at = (hours: number) => localInputFromMs(NOW + hours * HOUR);

const details: DetailsForm = {
  title: "Gala Opera Concert",
  description: "An evening of operatic masterworks.",
  category: "Classical & Opera",
  location: "National Arts Centre, Ottawa",
  start: at(30 * 24),
  end: at(30 * 24 + 3.5),
};

function type(overrides: Partial<TicketTypeForm> = {}): TicketTypeForm {
  return { ...newTicketType(), name: "General Admission", price: "15", supply: "1000", ...overrides };
}

describe("datetime-local helpers", () => {
  it("round-trips a local time to the minute", () => {
    const ms = NOW + 5 * DAY;
    expect(fromLocalInput(localInputFromMs(ms))).toBe(ms);
  });

  it("returns empty or null for missing and invalid values", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("not a date")).toBe("");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("2027-13-45T99:99")).toBeNull();
  });
});

describe("validateDetails", () => {
  it("accepts a complete form, with or without an end time", () => {
    expect(validateDetails(details, NOW)).toEqual({});
    expect(validateDetails({ ...details, end: "" }, NOW)).toEqual({});
  });

  it("asks for every required field", () => {
    expect(validateDetails(EMPTY_DETAILS, NOW)).toEqual({
      title: "Enter the event name.",
      category: "Choose a category.",
      location: "Enter the venue.",
      start: "Choose when the event starts.",
    });
  });

  it("treats whitespace as empty", () => {
    const errors = validateDetails({ ...details, title: "   ", location: " " }, NOW);
    expect(errors.title).toBe("Enter the event name.");
    expect(errors.location).toBe("Enter the venue.");
  });

  it("limits the lengths", () => {
    const errors = validateDetails({ ...details, title: "a".repeat(121), description: "a".repeat(2001), location: "a".repeat(201) }, NOW);
    expect(Object.keys(errors).sort()).toEqual(["description", "location", "title"]);
    expect(validateDetails({ ...details, title: "a".repeat(120), description: "a".repeat(2000) }, NOW)).toEqual({});
  });

  it("only accepts the fixed categories (#282)", () => {
    expect(validateDetails({ ...details, category: "Classical and opera" }, NOW).category).toBe("Choose a category.");
  });

  it("needs a start in the future and an end after the start", () => {
    expect(validateDetails({ ...details, start: at(-1) }, NOW).start).toBe("The start must be in the future.");
    expect(validateDetails({ ...details, end: details.start }, NOW).end).toBe("The end must be after the start.");
    expect(validateDetails({ ...details, end: at(1) }, NOW).end).toBe("The end must be after the start.");
  });
});

describe("validateCoverImage", () => {
  it("accepts PNG, JPG and WebP up to 10 MB", () => {
    expect(validateCoverImage({ type: "image/png", size: 10 * 1024 * 1024 })).toBeNull();
    expect(validateCoverImage({ type: "image/jpeg", size: 1 })).toBeNull();
    expect(validateCoverImage({ type: "image/webp", size: 1 })).toBeNull();
  });

  it("rejects a missing, wrong-type or oversized image", () => {
    expect(validateCoverImage(null)).toMatch(/Add a cover image/);
    expect(validateCoverImage({ type: "image/gif", size: 1 })).toBe("Use a PNG, JPG or WebP image.");
    expect(validateCoverImage({ type: "image/svg+xml", size: 1 })).toBe("Use a PNG, JPG or WebP image.");
    expect(validateCoverImage({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toBe("The image must be 10 MB or smaller.");
  });
});

describe("toEventPayload", () => {
  it("trims the text and sends the times as ISO strings", () => {
    const payload = toEventPayload({ ...details, title: "  Gala  ", location: " NAC " });
    expect(payload.title).toBe("Gala");
    expect(payload.location).toBe("NAC");
    expect(payload.start_date).toBe(new Date(fromLocalInput(details.start) as number).toISOString());
    expect(payload.end_date).toBe(new Date(fromLocalInput(details.end) as number).toISOString());
  });

  it("sends a cleared end time as null so the API removes it", () => {
    expect(toEventPayload({ ...details, end: "" }).end_date).toBeNull();
  });

  it("round-trips through the API's shape", () => {
    const payload = toEventPayload(details);
    const event = { ...payload, id: "e1", organizer_wallet: "0x1", image_url: null, contract_event_id: null, status: "DRAFT", ticket_types: [] } as ApiEvent;
    expect(detailsFromEvent(event)).toEqual({ ...details, description: details.description.trim() });
  });
});

describe("eventEndMs", () => {
  it("uses the end time, or 12 hours after the start without one", () => {
    expect(eventEndMs(details)).toBe(fromLocalInput(details.end));
    expect(eventEndMs({ ...details, end: "" })).toBe((fromLocalInput(details.start) as number) + 12 * HOUR);
    expect(eventEndMs(EMPTY_DETAILS)).toBeNull();
  });
});

describe("formatEventWhen", () => {
  const start = Date.parse("2027-03-06T23:00:00Z"); // 6:00 PM in Toronto
  it("shows one date when the event ends the same day", () => {
    expect(formatEventWhen(start, start + 3.5 * HOUR, "America/Toronto")).toBe("Sat, Mar 6, 2027 • 6:00 PM to 9:30 PM");
  });
  it("shows both dates when it ends another day, and only the start without an end", () => {
    expect(formatEventWhen(start, start + 8 * HOUR, "America/Toronto")).toBe("Sat, Mar 6, 2027 • 6:00 PM to Sun, Mar 7, 2027 • 2:00 AM");
    expect(formatEventWhen(start, null, "America/Toronto")).toBe("Sat, Mar 6, 2027 • 6:00 PM");
  });
});

describe("parsePrice", () => {
  it("reads plain amounts in the token's smallest unit", () => {
    expect(parsePrice("15", 6)).toBe(BigInt(15_000_000));
    expect(parsePrice("15.5", 6)).toBe(BigInt(15_500_000));
    expect(parsePrice(" 0.000001 ", 6)).toBe(BigInt(1));
    expect(parsePrice("0", 6)).toBe(BigInt(0));
  });

  it("rejects anything that isn't a plain amount with at most the token's decimals", () => {
    for (const bad of ["", "abc", "-1", "1e3", "1,000", "15.", ".5", "0.0000001", "Infinity"]) {
      expect(parsePrice(bad, 6)).toBeNull();
    }
  });
});

describe("validateTicketTypes", () => {
  it("accepts valid types", () => {
    expect(validateTicketTypes([type(), type({ name: "VIP", price: "28.00", supply: "300" })], 6).ok).toBe(true);
  });

  it("needs at least one type and at most 10", () => {
    expect(validateTicketTypes([], 6).list).toBe("Add at least one ticket type.");
    const many = Array.from({ length: 11 }, (_, i) => type({ name: `Type ${i}` }));
    expect(validateTicketTypes(many, 6).list).toMatch(/up to 10/);
  });

  it("flags each bad field on its own row", () => {
    const bad = type({ name: "", price: "1.1234567", supply: "0", description: "a".repeat(501) });
    const result = validateTicketTypes([bad], 6);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.rows[bad.key]).sort()).toEqual(["description", "name", "price", "supply"]);
  });

  it("rejects decimals and huge numbers in the supply", () => {
    expect(validateTicketTypes([type({ supply: "1.5" })], 6).ok).toBe(false);
    expect(validateTicketTypes([type({ supply: "2147483648" })], 6).ok).toBe(false);
    expect(validateTicketTypes([type({ supply: "2147483647" })], 6).ok).toBe(true);
  });

  it("allows free tickets but caps the price", () => {
    expect(validateTicketTypes([type({ price: "0" })], 6).ok).toBe(true);
    expect(validateTicketTypes([type({ price: "1000001" })], 6).ok).toBe(false);
  });

  it("rejects two types with the same name, ignoring case and spaces", () => {
    const second = type({ name: " general admission " });
    const result = validateTicketTypes([type(), second], 6);
    expect(result.rows[second.key]?.name).toBe("Another ticket type has this name.");
  });
});

describe("ticketTotals", () => {
  it("adds up capacity and revenue (Figma: 2 types, 1,300 tickets, 23,400.00 USDC)", () => {
    const totals = ticketTotals([type(), type({ name: "VIP", price: "28", supply: "300" })], 6);
    expect(totals).toEqual({ count: 2, capacity: 1300, revenue: BigInt(23_400_000_000) });
    expect(formatTokenAmount(totals.revenue, 6)).toBe("23,400.00");
  });

  it("skips rows that aren't filled in yet", () => {
    expect(ticketTotals([type(), type({ name: "VIP", price: "", supply: "" })], 6)).toEqual({ count: 2, capacity: 1000, revenue: BigInt(15_000_000_000) });
  });

  it("stays exact past JavaScript's safe integers", () => {
    const totals = ticketTotals([type({ price: "1000000", supply: "2147483647" })], 6);
    expect(totals.revenue).toBe(BigInt("2147483647000000000000"));
  });
});

describe("ticket types and the API", () => {
  const saved: ApiTicketType[] = [
    { id: "a", event_id: "e", name: "General Admission", description: "Floor", price: "15.00000000", supply: 1000, sold: 0, created_at: "2026-11-01T00:00:00Z" },
    { id: "b", event_id: "e", name: "VIP", description: null, price: "28.50000000", supply: 300, sold: 0, created_at: "2026-11-01T00:00:01Z" },
  ];

  it("reads the API's decimal prices back as typed", () => {
    expect(ticketTypeFromApi(saved[0]).price).toBe("15");
    expect(ticketTypeFromApi(saved[1]).price).toBe("28.5");
    expect(ticketTypeFromApi({ ...saved[0], price: "0.00000000" }).price).toBe("0");
    expect(ticketTypeFromApi(saved[1]).description).toBe("");
  });

  it("sends trimmed text, the price as typed and the supply as a number", () => {
    expect(toTicketTypePayload(type({ name: " VIP ", price: " 28.50 ", supply: "300", description: " Box " }))).toEqual({
      name: "VIP",
      description: "Box",
      price: "28.50",
      supply: 300,
    });
  });

  it("plans nothing when the form matches what's saved", () => {
    const form = saved.map(ticketTypeFromApi);
    expect(planTicketTypeSync(form, saved)).toEqual({ create: [], update: [], remove: [] });
    // "15.0" is the same amount as "15.00000000"
    expect(planTicketTypeSync([{ ...form[0], price: "15.0" }, form[1]], saved).update).toEqual([]);
  });

  it("creates new rows, updates changed ones and removes deleted ones", () => {
    const [ga] = saved.map(ticketTypeFromApi);
    const added = type({ name: "Balcony" });
    const plan = planTicketTypeSync([{ ...ga, supply: "900" }, added], saved);
    expect(plan.create.map((t) => t.key)).toEqual([added.key]);
    expect(plan.update.map((t) => t.id)).toEqual(["a"]);
    expect(plan.remove).toEqual(["b"]);
  });
});

describe("sale rules", () => {
  const rules: SaleRulesForm = { ...defaultSaleRules(details) };

  it("defaults to the Figma values, with sales ending when the event starts", () => {
    expect(rules).toEqual({ perWalletLimit: "4", salesEnd: details.start, resaleCapBps: 20_000, royaltyPercent: "10", presale: false });
    expect(validateSaleRules(rules, details, NOW)).toEqual({});
  });

  it("reads the royalty as basis points, up to 100%", () => {
    expect(parseRoyaltyBps("10")).toBe(1000);
    expect(parseRoyaltyBps("2.5")).toBe(250);
    expect(parseRoyaltyBps("0")).toBe(0);
    expect(parseRoyaltyBps("100")).toBe(10_000);
    expect(parseRoyaltyBps("100.01")).toBeNull();
    expect(parseRoyaltyBps("1.234")).toBeNull();
    expect(parseRoyaltyBps("-1")).toBeNull();
  });

  it("checks each field", () => {
    const errors = validateSaleRules({ perWalletLimit: "1.5", salesEnd: "", resaleCapBps: 12_345, royaltyPercent: "101", presale: false }, details, NOW);
    expect(Object.keys(errors).sort()).toEqual(["perWalletLimit", "resaleCapBps", "royaltyPercent", "salesEnd"]);
  });

  it("allows 0 for no wallet limit", () => {
    expect(validateSaleRules({ ...rules, perWalletLimit: "0" }, details, NOW)).toEqual({});
  });

  it("needs sales to end in the future and by the end of the event", () => {
    expect(validateSaleRules({ ...rules, salesEnd: at(-1) }, details, NOW).salesEnd).toBe("Sales must end in the future.");
    expect(validateSaleRules({ ...rules, salesEnd: at(30 * 24 + 4) }, details, NOW).salesEnd).toBe("Sales must end by the time the event ends.");
    expect(validateSaleRules({ ...rules, salesEnd: details.end }, details, NOW)).toEqual({});
    // Without an end time, up to 12 hours after the start
    const noEnd = { ...details, end: "" };
    expect(validateSaleRules({ ...rules, salesEnd: at(30 * 24 + 12) }, noEnd, NOW)).toEqual({});
    expect(validateSaleRules({ ...rules, salesEnd: at(30 * 24 + 13) }, noEnd, NOW).salesEnd).toBeDefined();
  });

  it("converts to configureEvent's arguments", () => {
    expect(toChainSettings(rules)).toEqual({
      endTime: BigInt(Math.floor((fromLocalInput(details.start) as number) / 1000)),
      royaltyBps: BigInt(1000),
      resaleCapBps: BigInt(20_000),
      perWalletLimit: BigInt(4),
    });
    expect(toChainSettings({ ...rules, royaltyPercent: "abc" })).toBeNull();
  });

  it("only restores sale rules this page saved", () => {
    expect(parseStoredSaleRules(JSON.stringify(rules))).toEqual(rules);
    expect(parseStoredSaleRules(null)).toBeNull();
    expect(parseStoredSaleRules("{bad json")).toBeNull();
    expect(parseStoredSaleRules(JSON.stringify({ ...rules, presale: "yes" }))).toBeNull();
  });
});

describe("resaleExample", () => {
  const types = [type(), type({ name: "VIP", price: "28", supply: "300" })];
  const format = (v: bigint) => formatTokenAmount(v, 6);
  const rules = defaultSaleRules(details);

  it("matches the Figma sentence, using the most expensive type", () => {
    expect(resaleExample(types, rules, 6, format)).toBe(
      "A VIP ticket (28.00 USDC) can be resold for up to 56.00 USDC before the event. You receive 10% of each resale.",
    );
  });

  it("handles no cap, no royalty, vowels and no ticket types", () => {
    expect(resaleExample([type({ name: "Early bird" })], { ...rules, resaleCapBps: 0, royaltyPercent: "0" }, 6, format)).toBe(
      "An Early bird ticket (15.00 USDC) can be resold at any price. You don't receive a royalty on resales.",
    );
    expect(resaleExample([], rules, 6, format)).toBe("Resale prices follow the cap you choose. You receive 10% of each resale.");
  });
});

describe("parseStep", () => {
  it("falls back to the first step", () => {
    expect(parseStep("review")).toBe("review");
    expect(parseStep("sale-rules")).toBe("sale-rules");
    expect(parseStep(null)).toBe("details");
    expect(parseStep("publish")).toBe("details");
  });
});
