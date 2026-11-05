// Organizer dashboard (#187): the organizer's own events in every status, the filter tabs,
// the status labels and the card totals. Kept free of React so the rules can be unit tested.

import { apiClient } from "@/lib/api";
import { sortTicketTypes, type ApiEvent } from "@/lib/event-details";
import { ROUTES } from "@/lib/nav";

// GET /api/events/mine returns every column of an event, like GET /api/events/:id
export interface OrganizerEvent extends ApiEvent {
  created_at: string;
  updated_at: string;
  sale_active: boolean;
  presale_active: boolean;
  sales_end_at: string | null;
}

export type OrganizerFilter = "all" | "live" | "unpublished" | "past";
export type OrganizerPhase = "draft" | "frozen" | "live" | "ended";
export type OrganizerBadgeTone = "neutral" | "warning" | "success";

export interface OrganizerStatus {
  phase: OrganizerPhase;
  label: string;
  tone: OrganizerBadgeTone;
  action: string;
  href: string;
}

export interface OrganizerSummary {
  total: number;
  live: number;
  unpublished: number;
  past: number;
  ticketsSold: number;
}

export interface EventSales {
  sold: number;
  supply: number;
  remaining: number;
  revenue: number;
}

// The API treats an event with no end date as over 12 hours after it starts, the same rule
// My Tickets uses (#310), so the dashboard's "Live" and "Past" tabs agree with it.
export const NO_END_DATE_GRACE_MS = 12 * 60 * 60 * 1000;

export function eventEnded(event: Pick<ApiEvent, "start_date" | "end_date">, now = Date.now()): boolean {
  const start = new Date(event.start_date).getTime();
  const end = event.end_date ? new Date(event.end_date).getTime() : start + NO_END_DATE_GRACE_MS;
  return Number.isFinite(end) && end < now;
}

export function organizerPhase(event: Pick<ApiEvent, "status" | "start_date" | "end_date">, now = Date.now()): OrganizerPhase {
  if (event.status === "DRAFT") return "draft";
  if (event.status === "FROZEN") return "frozen";
  return eventEnded(event, now) ? "ended" : "live";
}

// Drafts reopen the form; frozen events go straight to Review so the organizer can finish
// publishing. Published events open their public page.
export function eventEditorHref(event: Pick<OrganizerEvent, "id" | "status">): string {
  const params = new URLSearchParams({ draft: event.id });
  if (event.status === "FROZEN") params.set("step", "review");
  return `${ROUTES.newEvent}?${params.toString()}`;
}

export function publicEventHref(event: Pick<OrganizerEvent, "id">): string {
  return `/events/${encodeURIComponent(event.id)}`;
}

export function organizerEventStatus(event: OrganizerEvent, now = Date.now()): OrganizerStatus {
  const phase = organizerPhase(event, now);
  if (phase === "draft") {
    return { phase, label: "Draft", tone: "neutral", action: "Continue editing", href: eventEditorHref(event) };
  }
  if (phase === "frozen") {
    return { phase, label: "Ready to publish", tone: "warning", action: "Finish publishing", href: eventEditorHref(event) };
  }
  return {
    phase,
    label: phase === "live" ? "Live" : "Ended",
    tone: phase === "live" ? "success" : "neutral",
    action: "View event",
    href: publicEventHref(event),
  };
}

// The tab an event belongs to. Live and past are both PUBLISHED; everything else is unpublished.
export function organizerFilterFor(event: OrganizerEvent, now = Date.now()): Exclude<OrganizerFilter, "all"> {
  const phase = organizerPhase(event, now);
  if (phase === "live") return "live";
  if (phase === "ended") return "past";
  return "unpublished";
}

export function filterOrganizerEvents(events: OrganizerEvent[], filter: OrganizerFilter, now = Date.now()): OrganizerEvent[] {
  if (filter === "all") return events;
  return events.filter((event) => organizerFilterFor(event, now) === filter);
}

export function eventSales(event: Pick<OrganizerEvent, "ticket_types">): EventSales {
  let sold = 0;
  let supply = 0;
  let revenue = 0;

  for (const type of event.ticket_types) {
    sold += type.sold;
    supply += type.supply;
    const price = Number(type.price);
    if (Number.isFinite(price)) revenue += type.sold * price;
  }

  return { sold, supply, remaining: Math.max(0, supply - sold), revenue };
}

export function summarizeOrganizerEvents(events: OrganizerEvent[], now = Date.now()): OrganizerSummary {
  const summary: OrganizerSummary = { total: events.length, live: 0, unpublished: 0, past: 0, ticketsSold: 0 };

  for (const event of events) {
    const filter = organizerFilterFor(event, now);
    if (filter === "live") summary.live += 1;
    else if (filter === "past") summary.past += 1;
    else summary.unpublished += 1;
    summary.ticketsSold += eventSales(event).sold;
  }

  return summary;
}

type Request = <T>(path: string) => Promise<T>;
const defaultRequest: Request = (path) => apiClient(path);

// GET /api/events/mine. Accepts an array (the endpoint's shape) and also an { events } envelope,
// so a later paging change doesn't break the dashboard.
export async function fetchOrganizerEvents(request: Request = defaultRequest): Promise<OrganizerEvent[]> {
  const body = await request<OrganizerEvent[] | { events: OrganizerEvent[] }>("/api/events/mine");
  const events = Array.isArray(body) ? body : body.events;
  return events.map((event) => ({ ...event, ticket_types: sortTicketTypes(event.ticket_types) }));
}
