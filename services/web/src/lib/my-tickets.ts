// My Tickets (#286): grouping the wallet's tickets for display, labels and QR timing.
// Kept free of React so it can be unit tested.

import { sortTicketTypes, type ApiEvent } from "@/lib/event-details";
import { QR_MAX_AGE_SECONDS, type TicketQRData } from "@/lib/ticket-qr";

// One ticket the connected wallet owns, read from the contract (useOwnedTickets)
export interface OwnedTicket {
  tokenId: bigint;
  eventId: bigint;
  typeId: number | null; // tokenTicketType; null if it couldn't be read
  isUsed: boolean;
  checkedInAt: number | null; // unix seconds of the check-in, when known
}

// valid = can still be used at the door, used = checked in, expired = the event is over and it wasn't used
export type TicketStatus = "valid" | "used" | "expired";

// Tickets for the same event, type and status share one card ("2 × General Admission")
export interface TicketGroup {
  key: string;
  eventId: bigint;
  event: ApiEvent | null; // null when the API doesn't know the event (or couldn't be reached)
  title: string;
  typeName: string | null;
  status: TicketStatus;
  tickets: OwnedTicket[]; // sorted by token ID
  checkedInAt: number | null; // latest check-in in the group
}

export interface GroupedTickets {
  upcoming: TicketGroup[];
  past: TicketGroup[];
}

// Events without an end date count as over this long after they start
const NO_END_DATE_GRACE_MS = 12 * 60 * 60 * 1000;

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function eventHasEnded(event: Pick<ApiEvent, "start_date" | "end_date">, nowMs: number): boolean {
  const end = time(event.end_date) ?? (time(event.start_date) === null ? null : time(event.start_date)! + NO_END_DATE_GRACE_MS);
  return end !== null && nowMs > end;
}

// The API identifies events by its own id; tickets only know the contract's event ID
export function indexEventsByChainId(events: ApiEvent[]): Map<string, ApiEvent> {
  const byId = new Map<string, ApiEvent>();
  for (const event of events) {
    if (event.contract_event_id !== null && !byId.has(event.contract_event_id)) byId.set(event.contract_event_id, event);
  }
  return byId;
}

// Type names come from the API in creation order, which matches the contract's type IDs.
// TODO(#216): match on contract_type_id once the API stores it (same as buildTiers).
export function ticketTypeName(event: ApiEvent | null, typeId: number | null): string | null {
  if (typeId === null) return null;
  return (event && sortTicketTypes(event.ticket_types)[typeId]?.name) || `Ticket type ${typeId + 1}`;
}

export function ticketStatus(ticket: OwnedTicket, event: ApiEvent | null, nowMs: number): TicketStatus {
  if (ticket.isUsed) return "used";
  if (event && eventHasEnded(event, nowMs)) return "expired";
  return "valid";
}

// Upcoming = tickets you can still show at the door; past = used tickets and events that are over
export function groupTickets(tickets: OwnedTicket[], events: Map<string, ApiEvent> | null, nowMs: number): GroupedTickets {
  const groups = new Map<string, TicketGroup>();

  for (const ticket of [...tickets].sort((a, b) => compareBigInt(a.tokenId, b.tokenId))) {
    const event = events?.get(ticket.eventId.toString()) ?? null;
    const status = ticketStatus(ticket, event, nowMs);
    const key = `${ticket.eventId}-${ticket.typeId ?? "x"}-${status}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        eventId: ticket.eventId,
        event,
        title: event?.title ?? `Event #${ticket.eventId}`,
        typeName: ticketTypeName(event, ticket.typeId),
        status,
        tickets: [],
        checkedInAt: null,
      };
      groups.set(key, group);
    }
    group.tickets.push(ticket);
    if (ticket.checkedInAt !== null) group.checkedInAt = Math.max(group.checkedInAt ?? 0, ticket.checkedInAt);
  }

  const all = [...groups.values()];
  return {
    upcoming: all.filter((g) => g.status === "valid").sort(byDate("asc")),
    past: all.filter((g) => g.status !== "valid").sort(byDate("desc")),
  };
}

// Soonest first for upcoming, most recent first for past. Events the API doesn't know go last.
function byDate(direction: "asc" | "desc") {
  return (a: TicketGroup, b: TicketGroup): number => {
    const ta = time(a.event?.start_date);
    const tb = time(b.event?.start_date);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return direction === "asc" ? ta - tb : tb - ta;
    }
    return compareBigInt(a.eventId, b.eventId) || a.key.localeCompare(b.key);
  };
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The type tag: "General Admission". The count sits next to it ("2 tickets"), so it isn't repeated here.
export function typeBadgeLabel(group: TicketGroup): string | null {
  return group.typeName;
}

// Right of the tags, as in Figma: "Ticket #12" for one ticket, "2 tickets" for several
export function ticketCountLabel(group: TicketGroup): string {
  return group.tickets.length > 1 ? `${group.tickets.length} tickets` : `Ticket #${group.tickets[0].tokenId}`;
}

// Each ticket type of an event gets its own tag color, so two cards for the same event are easy to
// tell apart: the contract's first type is white, the second gold, the third burgundy, then repeat.
export type TypeTone = "white" | "gold" | "burgundy";
const TYPE_TONES: TypeTone[] = ["white", "gold", "burgundy"];

export function typeTone(typeId: number | null): TypeTone {
  return typeId === null || typeId < 0 ? "white" : TYPE_TONES[typeId % TYPE_TONES.length];
}

// "Sat, Mar 6, 2027 · Doors 6:00 PM", or just the day for past events. Viewer's time zone unless given.
export function formatTicketDate(iso: string, withTime: boolean, timeZone?: string): string | null {
  const ms = time(iso);
  if (ms === null) return null;
  const date = new Date(ms);
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone });
  if (!withTime) return day;
  const at = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return `${day} · Doors ${at}`;
}

// "Oct 10, 2026"
export function formatCheckInDate(unixSeconds: number, timeZone?: string): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
}

// What the owner signs to show their entry QR. The chain is always the contract's own chain, not the
// wallet's current network: the scanner rejects any other chain, and signing works on any network.
export function buildEntryQRData(
  ticket: Pick<OwnedTicket, "tokenId" | "eventId">,
  contractAddress: `0x${string}`,
  chainId: number,
  nowSeconds: number,
): TicketQRData {
  return {
    tokenId: ticket.tokenId.toString(),
    eventId: ticket.eventId.toString(),
    contractAddress,
    chainId,
    timestamp: nowSeconds,
  };
}

// Seconds left before the scanner stops accepting a code signed at `timestamp`
export function qrSecondsLeft(timestamp: number, nowSeconds: number): number {
  return Math.max(0, Math.min(QR_MAX_AGE_SECONDS, timestamp + QR_MAX_AGE_SECONDS - nowSeconds));
}

// True when the user closed or rejected the signature request in their wallet (wagmi wraps the error)
export function isSignatureRejected(error: unknown): boolean {
  const e = error as { name?: string; code?: number; message?: string; cause?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (e.name === "UserRejectedRequestError" || e.code === 4001) return true;
  if (typeof e.message === "string" && /user (rejected|denied)/i.test(e.message)) return true;
  return e.cause ? isSignatureRejected(e.cause) : false;
}

export type TicketView = "grid" | "list";

// The saved grid/list choice; anything unexpected falls back to the grid
export function parseTicketView(value: string | null | undefined): TicketView {
  return value === "list" ? "list" : "grid";
}
