// Scanner page rules (#287), from the Figma "Scanner Page" frames. Kept free of React so they can be tested.

import type { ApiEvent } from "@/lib/event-details";
import { formatEventDate } from "@/lib/events";
import type { TxState } from "@/lib/transactions/types";
import type { TicketVerification } from "@/lib/verify-ticket";

// Mirrors the access check in TicketNFT.checkInTicket(): a scanner for this event, this event's
// organizer, or an admin can check tickets in.
export function canScanEvent(
  wallet: string,
  access: { isEventScanner: boolean; eventOrganizer: string; hasOrganizerRole: boolean; isAdmin: boolean },
): boolean {
  const isThisEventsOrganizer = access.hasOrganizerRole && access.eventOrganizer.toLowerCase() === wallet.toLowerCase();
  return access.isEventScanner || isThisEventsOrganizer || access.isAdmin;
}

// Only events that are on-chain can have tickets checked in
export function onChainEvents(events: ApiEvent[]): (ApiEvent & { contract_event_id: string })[] {
  return events.filter((e): e is ApiEvent & { contract_event_id: string } => e.contract_event_id !== null);
}

// "Gala Opera Concert · Sat, Mar 6, 2027"
export function scannerEventLabel(event: Pick<ApiEvent, "title" | "start_date">, timeZone?: string): string {
  return `${event.title} · ${formatEventDate(event.start_date, timeZone)}`;
}

// Which result card to show. Venue staff must never read "admit" before the check-in is confirmed (#282).
export type ScanView = "valid" | "checkingIn" | "pending" | "failed" | "checkedIn" | "rejected";

export function scanView(result: TicketVerification, phase: TxState["phase"]): ScanView {
  if (!result.ok) return "rejected";
  switch (phase) {
    case "preparing":
    case "awaitingWallet":
    case "confirming":
      return "checkingIn";
    case "stillPending":
    case "stoppedWaiting":
      return "pending";
    case "error":
      return "failed";
    case "success":
      return "checkedIn";
    default:
      return "valid";
  }
}

// The camera can be resumed (scan the next ticket) unless a check-in is waiting on the wallet or the chain
export function canResumeCamera(view: ScanView | null, phase: TxState["phase"]): boolean {
  if (view === "checkingIn") return false;
  return !(view === "pending" && phase === "stillPending");
}

// "12 seconds ago", "1 second ago", "3 minutes ago"
export function signedAgo(timestampSeconds: number, nowSeconds: number): string {
  const seconds = Math.max(0, Math.floor(nowSeconds - timestampSeconds));
  if (seconds < 60) return seconds === 1 ? "1 second ago" : `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}

// "Today at 6:42 PM", or "Mar 6 at 6:42 PM" for another day
export function formatCheckedInAt(unixSeconds: number, now: Date, timeZone?: string): string {
  const date = new Date(unixSeconds * 1000);
  const dayKey = (d: Date) => d.toLocaleDateString("en-US", { timeZone });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  if (dayKey(date) === dayKey(now)) return `Today at ${time}`;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  return `${day} at ${time}`;
}

// Remember the event between reloads; fall back to the first event the wallet can scan
export function pickEventId(available: string[], remembered: string | null): string | null {
  if (remembered && available.includes(remembered)) return remembered;
  return available[0] ?? null;
}

// Real contract event IDs are long numbers, so name the events instead (#287 review)
export function wrongEventReason(ticketEventTitle: string | null, scanningEventTitle: string): string {
  return ticketEventTitle
    ? `This ticket is for ${ticketEventTitle}, not ${scanningEventTitle}.`
    : `This ticket is for a different event, not ${scanningEventTitle}.`;
}

// What to tell staff when the camera fails, with a hint that fits the cause (#287 review).
// The browser's DOMException name tells the cases apart; the QR scanner library passes it as
// `cause` and also sorts it into a `kind`. Some failures have an empty message, so there is always a fallback.
type CameraError = { name?: string; kind?: string; message?: string; cause?: unknown } | null | undefined;

const RELOAD_HINT = "Allow camera access in your browser, then reload this page.";

export function cameraErrorMessage(error: CameraError): string {
  const name = (error?.cause as { name?: string } | undefined)?.name ?? error?.name;
  const kind = error?.kind;

  if (name === "NotAllowedError" || kind === "permission-denied") return `Camera access is blocked. ${RELOAD_HINT}`;
  if (name === "NotFoundError" || name === "OverconstrainedError" || kind === "no-camera" || kind === "overconstrained") {
    return "No camera found. Connect a camera or open this page on a phone.";
  }
  if (name === "NotReadableError" || kind === "in-use") return "The camera is in use by another app. Close it, then reload this page.";
  // Opened over plain http (e.g. the laptop's local IP on a phone): browsers only allow the camera on https or localhost
  if (kind === "insecure-context") return "The camera needs a secure (https) page. Open the scanner over https, or on localhost.";

  const text = error?.message?.trim();
  const sentence = !text ? "The camera couldn't start." : /[.!?]$/.test(text) ? text : `${text}.`;
  return `${sentence} ${RELOAD_HINT}`;
}
