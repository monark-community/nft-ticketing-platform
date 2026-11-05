import { describe, expect, it } from "vitest";

import {
  eventEditorHref,
  eventEnded,
  eventSales,
  fetchOrganizerEvents,
  filterOrganizerEvents,
  NO_END_DATE_GRACE_MS,
  organizerEventStatus,
  organizerFilterFor,
  organizerPhase,
  publicEventHref,
  summarizeOrganizerEvents,
  type OrganizerEvent,
} from "@/lib/organizer-events";

// Organizer dashboard rules (#187): statuses, tabs, totals and the API call.

const NOW = Date.UTC(2030, 5, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

function event(overrides: Partial<OrganizerEvent> = {}): OrganizerEvent {
  return {
    id: "event-1",
    organizer_wallet: "0x1111111111111111111111111111111111111111",
    title: "Test event",
    description: null,
    location: "Montreal",
    category: "Concerts",
    start_date: iso(NOW + 24 * HOUR),
    end_date: iso(NOW + 28 * HOUR),
    image_url: null,
    contract_event_id: null,
    status: "DRAFT",
    created_at: iso(NOW - HOUR),
    updated_at: iso(NOW - HOUR),
    sale_active: false,
    presale_active: false,
    sales_end_at: null,
    ticket_types: [],
    ...overrides,
  };
}

describe("organizerPhase", () => {
  it("uses the event status before the dates", () => {
    expect(organizerPhase(event({ status: "DRAFT", start_date: iso(NOW - 48 * HOUR) }), NOW)).toBe("draft");
    expect(organizerPhase(event({ status: "FROZEN", start_date: iso(NOW - 48 * HOUR) }), NOW)).toBe("frozen");
  });

  it("splits published events into live and ended", () => {
    expect(organizerPhase(event({ status: "PUBLISHED", start_date: iso(NOW - HOUR), end_date: iso(NOW + HOUR) }), NOW)).toBe("live");
    expect(organizerPhase(event({ status: "PUBLISHED", start_date: iso(NOW - 3 * HOUR), end_date: iso(NOW - HOUR) }), NOW)).toBe("ended");
  });

  it("treats a published event with no end date as over 12 hours after it starts", () => {
    const running = event({ status: "PUBLISHED", start_date: iso(NOW - 11 * HOUR), end_date: null });
    expect(organizerPhase(running, NOW)).toBe("live");
    expect(eventEnded(running, NOW + 2 * HOUR)).toBe(true);
    expect(NO_END_DATE_GRACE_MS).toBe(12 * HOUR);
  });
});

describe("organizerEventStatus", () => {
  it("labels drafts and sends them back to the form", () => {
    const draft = event({ id: "a b", status: "DRAFT" });
    expect(organizerEventStatus(draft, NOW)).toMatchObject({
      phase: "draft",
      label: "Draft",
      tone: "neutral",
      action: "Continue editing",
      href: "/organizer/events/new?draft=a+b",
    });
    expect(eventEditorHref(event({ status: "DRAFT" }))).toBe("/organizer/events/new?draft=event-1");
  });

  it("sends frozen events to the review step so they can finish publishing", () => {
    const frozen = event({ status: "FROZEN" });
    expect(organizerEventStatus(frozen, NOW)).toMatchObject({
      label: "Ready to publish",
      tone: "warning",
      action: "Finish publishing",
      href: "/organizer/events/new?draft=event-1&step=review",
    });
  });

  it("marks published events live until they end", () => {
    const live = event({ id: "event-2", status: "PUBLISHED" });
    expect(organizerEventStatus(live, NOW)).toMatchObject({
      label: "Live",
      tone: "success",
      action: "View event",
      href: "/events/event-2",
    });

    const ended = event({ status: "PUBLISHED", start_date: iso(NOW - 3 * HOUR), end_date: iso(NOW - HOUR) });
    expect(organizerEventStatus(ended, NOW)).toMatchObject({ label: "Ended", tone: "neutral" });
    expect(publicEventHref(event({ id: "a b" }))).toBe("/events/a%20b");
  });
});

describe("filters and totals", () => {
  const draft = event({ id: "draft", status: "DRAFT" });
  const frozen = event({ id: "frozen", status: "FROZEN" });
  const live = event({ id: "live", status: "PUBLISHED" });
  const ended = event({
    id: "ended",
    status: "PUBLISHED",
    start_date: iso(NOW - 3 * HOUR),
    end_date: iso(NOW - HOUR),
  });
  const events = [draft, frozen, live, ended];

  it("groups each status into one tab", () => {
    expect(events.map((item) => organizerFilterFor(item, NOW))).toEqual(["unpublished", "unpublished", "live", "past"]);
    expect(filterOrganizerEvents(events, "all", NOW)).toHaveLength(4);
    expect(filterOrganizerEvents(events, "live", NOW).map((item) => item.id)).toEqual(["live"]);
    expect(filterOrganizerEvents(events, "unpublished", NOW).map((item) => item.id)).toEqual(["draft", "frozen"]);
    expect(filterOrganizerEvents(events, "past", NOW).map((item) => item.id)).toEqual(["ended"]);
  });

  it("counts events and paid tickets for the summary", () => {
    const withSales = [
      { ...live, ticket_types: [{ ...ticketType("GA", "25"), sold: 10 }] },
      { ...ended, ticket_types: [{ ...ticketType("VIP", "40", 100), sold: 4 }] },
      draft,
    ];

    expect(summarizeOrganizerEvents(withSales, NOW)).toEqual({
      total: 3,
      live: 1,
      unpublished: 1,
      past: 1,
      ticketsSold: 14,
    });
  });
});

describe("eventSales", () => {
  it("adds the ticket types' sold and supply counts and the paid revenue", () => {
    expect(
      eventSales({
        ticket_types: [
          { ...ticketType("GA", "25"), sold: 10 },
          { ...ticketType("VIP", "40.5", 50), sold: 2 },
        ],
      })
    ).toEqual({ sold: 12, supply: 350, remaining: 338, revenue: 331 });
  });

  it("is empty for an event without ticket types", () => {
    expect(eventSales({ ticket_types: [] })).toEqual({ sold: 0, supply: 0, remaining: 0, revenue: 0 });
  });
});

describe("fetchOrganizerEvents", () => {
  it("loads /api/events/mine and sorts ticket types into creation order", async () => {
    const second = ticketType("VIP", "40", 50, "2029-01-02T00:00:00Z");
    const first = ticketType("GA", "25", 100, "2029-01-01T00:00:00Z");
    const calls: string[] = [];

    const events = await fetchOrganizerEvents(async <T,>(path: string) => {
      calls.push(path);
      return [event({ ticket_types: [second, first] })] as T;
    });

    expect(calls).toEqual(["/api/events/mine"]);
    expect(events[0].ticket_types.map((type) => type.name)).toEqual(["GA", "VIP"]);
  });

  it("also accepts an { events } envelope", async () => {
    const events = await fetchOrganizerEvents(async <T,>() => ({ events: [event()] }) as T);
    expect(events).toHaveLength(1);
  });
});

function ticketType(name: string, price: string, supply = 300, created_at = "2029-01-01T00:00:00Z") {
  return {
    id: `${name}-id`,
    event_id: "event-1",
    name,
    description: null,
    price,
    supply,
    sold: 0,
    contract_type_id: null,
    created_at,
  };
}
