import { describe, expect, it } from "vitest";

import {
  appendEvents,
  EVENT_SEARCH_MAX,
  eventStockStatus,
  eventHref,
  eventsPath,
  filtersFromParams,
  filtersToQuery,
  formatEventDate,
  formatPrice,
  hasEventFilters,
  hostBannerLink,
  NO_EVENT_FILTERS,
  QUICK_CATEGORIES,
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

describe("event filters (#320)", () => {
  it("knows when a filter is set", () => {
    expect(hasEventFilters(NO_EVENT_FILTERS)).toBe(false);
    expect(hasEventFilters({ q: "   ", category: "" })).toBe(false);
    expect(hasEventFilters({ q: "jazz", category: "" })).toBe(true);
    expect(hasEventFilters({ q: "", category: "Concerts" })).toBe(true);
  });

  it("builds the API path with only the filters that are set", () => {
    expect(eventsPath(NO_EVENT_FILTERS, 1, 9)).toBe("/api/events?page=1&limit=9");
    expect(eventsPath({ q: "  ottawa jazz ", category: "" }, 2, 9)).toBe("/api/events?page=2&limit=9&q=ottawa+jazz");
    expect(eventsPath({ q: "", category: "Theater & Arts" }, 1, 6)).toBe("/api/events?page=1&limit=6&category=Theater+%26+Arts");
    expect(eventsPath({ q: "50% off?", category: "Web3 & Tech" }, 1, 9)).toBe("/api/events?page=1&limit=9&q=50%25+off%3F&category=Web3+%26+Tech");
  });

  it("uses the first four categories as quick-select chips", () => {
    expect(QUICK_CATEGORIES).toEqual(["Concerts", "Theater & Arts", "Sports & Arenas", "Web3 & Tech"]);
  });

  it("reads the filters from the page address", () => {
    expect(filtersFromParams(new URLSearchParams(""))).toEqual(NO_EVENT_FILTERS);
    expect(filtersFromParams(new URLSearchParams("q=+ottawa+&category=Theater+%26+Arts"))).toEqual({ q: "ottawa", category: "Theater & Arts" });
  });

  it("drops what the API would refuse: an unknown category and a search past the limit", () => {
    expect(filtersFromParams(new URLSearchParams("category=Comedy"))).toEqual(NO_EVENT_FILTERS);
    expect(filtersFromParams(new URLSearchParams("category=concerts")).category).toBe("");
    const long = filtersFromParams(new URLSearchParams(`q=${"x".repeat(EVENT_SEARCH_MAX + 20)}`));
    expect(long.q).toHaveLength(EVENT_SEARCH_MAX);
  });

  it("writes the filters back to the address, and nothing when none is set", () => {
    expect(filtersToQuery(NO_EVENT_FILTERS)).toBe("");
    expect(filtersToQuery({ q: " ", category: "" })).toBe("");
    expect(filtersToQuery({ q: "tech & web3", category: "" })).toBe("?q=tech+%26+web3");
    const both = { q: "toronto", category: "Sports & Arenas" };
    expect(filtersToQuery(both)).toBe("?q=toronto&category=Sports+%26+Arenas");
    expect(filtersFromParams(new URLSearchParams(filtersToQuery(both)))).toEqual(both);
  });
});

describe("hostBannerLink (#320)", () => {
  const attendee = { role: "USER" as const, profile_complete: true };
  const base = { walletReady: true, isConnected: true, user: attendee, signInFailed: false, request: "none" as const };

  it("sends visitors without a wallet to sign-up", () => {
    expect(hostBannerLink({ ...base, isConnected: false, user: null, request: undefined })).toBe("signup");
  });

  it("waits while the wallet reconnects or the sign-in is in progress", () => {
    expect(hostBannerLink({ ...base, walletReady: false, isConnected: false, user: null, request: undefined })).toBeNull();
    expect(hostBannerLink({ ...base, user: null, request: undefined })).toBeNull();
  });

  it("sends a connected wallet whose sign-in was cancelled, or with no account yet, to sign-up", () => {
    expect(hostBannerLink({ ...base, user: null, signInFailed: true, request: undefined })).toBe("signup");
    expect(hostBannerLink({ ...base, user: { role: "USER", profile_complete: false }, request: undefined })).toBe("signup");
  });

  it("sends a signed-in attendee to the profile, also after a rejected request or one that can't be read", () => {
    expect(hostBannerLink(base)).toBe("profile");
    expect(hostBannerLink({ ...base, request: "rejected" })).toBe("profile");
    expect(hostBannerLink({ ...base, request: null })).toBe("profile");
  });

  it("hides for an attendee whose request is loading, pending or approved", () => {
    expect(hostBannerLink({ ...base, request: undefined })).toBeNull();
    expect(hostBannerLink({ ...base, request: "pending" })).toBeNull();
    expect(hostBannerLink({ ...base, request: "approved" })).toBeNull();
  });

  it("hides for organizers, admins and scanners", () => {
    for (const role of ["ORGANIZER", "ADMIN", "SCANNER"] as const) {
      expect(hostBannerLink({ ...base, user: { role, profile_complete: true } })).toBeNull();
    }
  });
});
