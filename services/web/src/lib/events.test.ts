import { describe, expect, it } from "vitest";

import {
  appendEvents,
  eventStockStatus,
  eventHref,
  formatEventDate,
  formatPrice,
  startingPrice,
  type EventSummary,
  type TicketTypeSummary,
} from "./events";

const tt = (price: string | number, supply = 100, sold = 0): TicketTypeSummary => ({
  id: `tt-${price}-${supply}-${sold}`,
  name: "General",
  price,
  supply,
  sold,
});

const ev = (id: string): EventSummary => ({
  id,
  title: id,
  location: null,
  category: null,
  start_date: "2027-03-06T19:00:00.000Z",
  image_url: null,
  ticket_types: [],
});

describe("startingPrice", () => {
  it("returns the cheapest ticket type, reading Decimal strings", () => {
    expect(startingPrice([tt("45"), tt("15.5"), tt(80)])).toBe(15.5);
  });

  it("returns null when there are no ticket types", () => {
    expect(startingPrice([])).toBeNull();
  });
});

describe("formatPrice", () => {
  it("shows two decimals and the currency", () => {
    expect(formatPrice(15)).toBe("15.00 USDC");
    expect(formatPrice(28.5)).toBe("28.50 USDC");
  });
});

describe("formatEventDate", () => {
  it("formats like the Figma cards", () => {
    expect(formatEventDate("2027-03-06T19:00:00.000Z", "UTC")).toBe("Sat, Mar 6, 2027");
  });

  it("handles a bad date", () => {
    expect(formatEventDate("not a date")).toBe("Date to be announced");
  });
});

describe("eventStockStatus", () => {
  it("is sold out when every ticket type is sold out", () => {
    expect(eventStockStatus([tt(10, 50, 50), tt(20, 10, 10)])).toBe("soldOut");
  });

  it("uses the shared low stock rule across all types", () => {
    expect(eventStockStatus([tt(10, 100, 70)])).toBe("low");
    expect(eventStockStatus([tt(10, 100, 50)])).toBe("available");
  });

  it("is available when one type is sold out but others have plenty", () => {
    expect(eventStockStatus([tt(10, 50, 50), tt(20, 100, 0)])).toBe("available");
  });

  it("is null when nothing is on sale yet", () => {
    expect(eventStockStatus([])).toBeNull();
  });
});

describe("eventHref", () => {
  it("links to the event page", () => {
    expect(eventHref("abc-123")).toBe("/events/abc-123");
  });
});

describe("appendEvents", () => {
  it("adds the next page without duplicates", () => {
    expect(appendEvents([ev("a"), ev("b")], [ev("b"), ev("c")]).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
