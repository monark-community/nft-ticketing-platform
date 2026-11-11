// Event list helpers for the home page (#283). Kept free of React so they can be tested.

import { EVENT_CATEGORIES } from "@/lib/create-event";
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

// Search and category filter on the home page (#320). Empty strings mean "no filter".
export interface EventFilters {
  q: string;
  category: string;
}

export const NO_EVENT_FILTERS: EventFilters = { q: "", category: "" };

// The API refuses a longer search (services/api event.controller)
export const EVENT_SEARCH_MAX = 100;

// The "Quick select" chips are the first categories of the list; the dropdown has all of them
export const QUICK_CATEGORIES = EVENT_CATEGORIES.slice(0, 4);

export function hasEventFilters(filters: EventFilters) {
  return filters.q.trim() !== "" || filters.category !== "";
}

// The filters live in the page's address (/?q=jazz&category=Concerts), so a reload, the Back button
// and a shared link keep them. Anything the API would refuse is dropped: an unknown category, and
// the part of a search past the limit.
export function filtersFromParams(params: { get(name: string): string | null }): EventFilters {
  const q = (params.get("q") ?? "").trim().slice(0, EVENT_SEARCH_MAX).trim();
  const category = params.get("category") ?? "";
  return { q, category: (EVENT_CATEGORIES as readonly string[]).includes(category) ? category : "" };
}

// "" when no filter is set, otherwise "?q=…&category=…"
export function filtersToQuery(filters: EventFilters) {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.category) params.set("category", filters.category);
  const query = params.toString();
  return query ? `?${query}` : "";
}

// GET /api/events with paging and the filters that are set
export function eventsPath(filters: EventFilters, page: number, limit: number) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.category) params.set("category", filters.category);
  return `/api/events?${params.toString()}`;
}

// "Want to host an event?" banner (#320): where "Request access" goes, or null to hide the banner.
// Visitors without an account go to sign-up; signed-in attendees go to the organizer request on
// their profile. Organizers, admins, scanners and attendees whose request is pending (or approved)
// don't see it, and it stays hidden while the wallet or the request is still loading.
export type HostBannerLink = "signup" | "profile";

export function hostBannerLink(state: {
  walletReady: boolean; // mounted, and the wallet isn't reconnecting
  isConnected: boolean;
  user: { role: "USER" | "ORGANIZER" | "SCANNER" | "ADMIN"; profile_complete: boolean } | null;
  signInFailed: boolean; // the wallet is connected but the sign-in was cancelled or failed
  request: "none" | "pending" | "approved" | "rejected" | null | undefined; // undefined = not loaded yet, null = couldn't be read
}): HostBannerLink | null {
  const { walletReady, isConnected, user, signInFailed, request } = state;
  if (!walletReady) return null;
  if (!isConnected) return "signup";
  if (!user) return signInFailed ? "signup" : null; // still signing in: wait
  if (!user.profile_complete) return "signup";
  if (user.role !== "USER") return null;
  if (request === undefined || request === "pending" || request === "approved") return null;
  return "profile";
}
