// Event list helpers for the home page (#283). Kept free of React so they can be tested.

import { getStockStatus, type StockStatus } from "@/lib/ticket-stock";

// Shapes returned by GET /api/events (Prisma Decimal prices arrive as strings)
export interface TicketTypeSummary {
  id: string;
  name: string;
  price: string | number;
  supply: number;
  sold: number;
}

export interface EventSummary {
  id: string;
  title: string;
  location: string | null;
  category: string | null;
  start_date: string;
  image_url: string | null;
  ticket_types: TicketTypeSummary[];
}

export interface EventsPage {
  events: EventSummary[];
  total: number;
  page: number;
  limit: number;
}

// The event page lives at /events/[id] (#284)
export function eventHref(id: string) {
  return `/events/${encodeURIComponent(id)}`;
}

// Cheapest ticket type, or null when the event has no ticket types yet
export function startingPrice(ticketTypes: TicketTypeSummary[]): number | null {
  const prices = ticketTypes.map((t) => Number(t.price)).filter((p) => Number.isFinite(p));
  return prices.length ? Math.min(...prices) : null;
}

// Prices are in USDC, shown with two decimals
export function formatPrice(price: number) {
  return `${price.toFixed(2)} USDC`;
}

// "Sat, Mar 6, 2027"
export function formatEventDate(iso: string, timeZone?: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone });
}

// Stock across all of an event's ticket types, using the shared rule from lib/ticket-stock.ts (#284).
// null when nothing is on sale yet, so the card shows no stock badge.
export function eventStockStatus(ticketTypes: TicketTypeSummary[]): StockStatus | null {
  const supply = ticketTypes.reduce((sum, t) => sum + t.supply, 0);
  if (supply === 0) return null;
  const remaining = ticketTypes.reduce((sum, t) => sum + Math.max(0, t.supply - t.sold), 0);
  return getStockStatus(remaining, supply);
}

// Merge a newly loaded page, skipping events already shown (the list can shift between requests)
export function appendEvents(current: EventSummary[], next: EventSummary[]) {
  const seen = new Set(current.map((e) => e.id));
  return [...current, ...next.filter((e) => !seen.has(e.id))];
}
