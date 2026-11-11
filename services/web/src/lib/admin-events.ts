// Admin Events tab (#296): the list from GET /api/admin/events (#297) and the rules of the
// "Edit event settings" panel. Kept free of React so the rules can be unit tested.

import {
  fromLocalInput,
  localInputFromMs,
  MAX_PER_WALLET,
  parseRoyaltyBps,
  parseSupply,
  RESALE_CAP_OPTIONS,
  type FieldErrors,
} from "@/lib/create-event";
import { formatMultiplier, formatPercent } from "@/lib/event-details";
import { getTransactionErrorMessage } from "@/lib/transactions/errors";

// ---------------------------------------------------------------------------------------------
// The list

export interface AdminEventOrganizer {
  wallet: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  organization_name: string | null;
}

export interface AdminEvent {
  id: string;
  title: string;
  location: string | null;
  status: "DRAFT" | "FROZEN" | "PUBLISHED";
  sale_active: boolean;
  presale_active: boolean;
  contract_event_id: string | null;
  start_date: string;
  end_date: string | null;
  organizer: AdminEventOrganizer;
  sold: number;
  supply: number;
  // The listener's copy of the contract's settings: null until the event is published
  royalty_bps: number | null;
  resale_cap_bps: number | null;
  per_wallet_limit: number | null;
  sales_end_at: string | null;
}

export interface AdminEventsPage {
  events: AdminEvent[];
  total: number;
  page: number;
  limit: number;
}

export const ADMIN_EVENTS_PAGE_SIZE = 20;
export const ADMIN_EVENT_SEARCH_MAX = 100; // same limit as the API

export type AdminEventStatusFilter = "all" | "live" | "draft";

export const STATUS_FILTER_OPTIONS: { value: AdminEventStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "live", label: "Published" },
  { value: "draft", label: "Draft" },
];

export function adminEventsPath(options: { q?: string; status?: AdminEventStatusFilter; page?: number; limit?: number } = {}): string {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? ADMIN_EVENTS_PAGE_SIZE),
  });
  const q = options.q?.trim();
  if (q) params.set("q", q);
  if (options.status === "live") params.set("live", "true");
  if (options.status === "draft") params.set("live", "false");
  return `/api/admin/events?${params}`;
}

export function pageCount(total: number, pageSize = ADMIN_EVENTS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export interface AdminEventStatus {
  label: "Published" | "Presale" | "Draft";
  tone: "success" | "highlight" | "neutral";
}

// The Figma's three statuses. An event that is saved or frozen but not on the contract yet is a draft.
export function adminEventStatus(event: Pick<AdminEvent, "status" | "presale_active">): AdminEventStatus {
  if (event.status !== "PUBLISHED") return { label: "Draft", tone: "neutral" };
  return event.presale_active ? { label: "Presale", tone: "highlight" } : { label: "Published", tone: "success" };
}

// Only events that are on the contract have settings to change ("Not live yet" otherwise)
export function canEditSettings(event: Pick<AdminEvent, "status" | "contract_event_id">): boolean {
  return event.status === "PUBLISHED" && event.contract_event_id !== null;
}

// "1,195 of 1,450", and how full the bar is
export function soldSummary(event: Pick<AdminEvent, "sold" | "supply">): { text: string; percent: number } {
  const format = (n: number) => n.toLocaleString("en-US");
  const percent = event.supply > 0 ? Math.min(100, Math.round((event.sold / event.supply) * 100)) : 0;
  return { text: `${format(event.sold)} of ${format(event.supply)}`, percent };
}

export function royaltyText(bps: number | null): string {
  return bps === null ? "—" : formatPercent(bps);
}

// "2×", "1.5×", "No cap"
export function resaleCapText(bps: number | null): string {
  if (bps === null) return "—";
  return bps === 0 ? "No cap" : formatMultiplier(bps);
}

// ---------------------------------------------------------------------------------------------
// Edit event settings. Saving calls adminUpdateEventSettings(), which replaces all four values,
// so the panel starts from the contract's current values, not from the API's copy.

export interface EventSettings {
  royaltyBps: number;
  resaleCapBps: number; // 0 = no cap
  perWalletLimit: number; // 0 = no limit
  salesEndSec: number; // the contract's endTime, unix seconds
}

// eventConfigs(eventId): endTime, resaleCapBps, ticketTypeCount, sold, configured, active, perWalletLimit
export type EventConfigResult = readonly [bigint, bigint, bigint, bigint, boolean, boolean, bigint];

// null when the event isn't configured on the contract (the call would revert)
export function settingsFromChain(config: EventConfigResult, royaltyBps: bigint): EventSettings | null {
  const [endTime, resaleCapBps, , , configured, , perWalletLimit] = config;
  if (!configured) return null;
  return {
    royaltyBps: Number(royaltyBps),
    resaleCapBps: Number(resaleCapBps),
    perWalletLimit: Number(perWalletLimit),
    salesEndSec: Number(endTime),
  };
}

export interface SettingsForm {
  royaltyPercent: string;
  resaleCapBps: number;
  perWalletLimit: string; // "0" = no limit
  salesEnd: string; // datetime-local, the admin's local time
}

export function settingsToForm(settings: EventSettings): SettingsForm {
  return {
    royaltyPercent: String(Number((settings.royaltyBps / 100).toFixed(2))),
    resaleCapBps: settings.resaleCapBps,
    perWalletLimit: String(settings.perWalletLimit),
    salesEnd: localInputFromMs(settings.salesEndSec * 1000),
  };
}

// The usual choices, plus the event's own cap when it isn't one of them (set outside this app)
export function resaleCapChoices(currentBps: number): { bps: number; label: string }[] {
  const choices: { bps: number; label: string }[] = [...RESALE_CAP_OPTIONS];
  if (!choices.some((choice) => choice.bps === currentBps)) {
    choices.push({ bps: currentBps, label: `${formatMultiplier(currentBps)} face value` });
    choices.sort((a, b) => a.bps - b.bps);
  }
  return choices;
}

// The contract's own rules: royalty up to 100%, cap of 0 or at least 1× face value, and a sales
// end in the future (also when only another setting changes).
export function validateSettings(form: SettingsForm, nowMs: number): FieldErrors<keyof SettingsForm> {
  const errors: FieldErrors<keyof SettingsForm> = {};
  if (parseRoyaltyBps(form.royaltyPercent) === null) errors.royaltyPercent = "Enter a percentage from 0 to 100 (up to 2 decimals).";
  if (form.resaleCapBps !== 0 && form.resaleCapBps < 10_000) errors.resaleCapBps = "Choose a resale cap.";

  const limit = parseSupply(form.perWalletLimit);
  if (limit === null) errors.perWalletLimit = "Enter a whole number. 0 means no limit.";
  else if (limit > MAX_PER_WALLET) errors.perWalletLimit = `Keep it at ${MAX_PER_WALLET.toLocaleString("en-US")} or less.`;

  const salesEnd = fromLocalInput(form.salesEnd);
  if (salesEnd === null) errors.salesEnd = "Choose when ticket sales end.";
  else if (salesEnd <= nowMs) errors.salesEnd = "Sales must end in the future.";
  return errors;
}

// The values to send, or null if the form isn't valid. The date input has no seconds, so an
// untouched sales end keeps the contract's exact time instead of losing its seconds.
export function formToSettings(form: SettingsForm, current: EventSettings): EventSettings | null {
  const royaltyBps = parseRoyaltyBps(form.royaltyPercent);
  const perWalletLimit = parseSupply(form.perWalletLimit);
  const salesEndMs = fromLocalInput(form.salesEnd);
  if (royaltyBps === null || perWalletLimit === null || salesEndMs === null) return null;
  const untouched = form.salesEnd === settingsToForm(current).salesEnd;
  return {
    royaltyBps,
    resaleCapBps: form.resaleCapBps,
    perWalletLimit,
    salesEndSec: untouched ? current.salesEndSec : Math.floor(salesEndMs / 1000),
  };
}

export function sameSettings(a: EventSettings, b: EventSettings): boolean {
  return (
    a.royaltyBps === b.royaltyBps &&
    a.resaleCapBps === b.resaleCapBps &&
    a.perWalletLimit === b.perWalletLimit &&
    a.salesEndSec === b.salesEndSec
  );
}

// adminUpdateEventSettings(eventId, endTime, royaltyBps, resaleCapBps, perWalletLimit)
export function settingsArgs(contractEventId: string, settings: EventSettings): readonly bigint[] {
  return [
    BigInt(contractEventId),
    BigInt(settings.salesEndSec),
    BigInt(settings.royaltyBps),
    BigInt(settings.resaleCapBps),
    BigInt(settings.perWalletLimit),
  ];
}

// The list row as it will be once the listener has saved the change
export function withSettings(event: AdminEvent, settings: EventSettings): AdminEvent {
  return {
    ...event,
    royalty_bps: settings.royaltyBps,
    resale_cap_bps: settings.resaleCapBps,
    per_wallet_limit: settings.perWalletLimit,
    sales_end_at: new Date(settings.salesEndSec * 1000).toISOString(),
  };
}

// Whether the API's copy already has these settings (the listener caught up)
export function hasSettings(event: AdminEvent, settings: EventSettings): boolean {
  return (
    event.royalty_bps === settings.royaltyBps &&
    event.resale_cap_bps === settings.resaleCapBps &&
    event.per_wallet_limit === settings.perWalletLimit &&
    event.sales_end_at !== null &&
    Math.floor(new Date(event.sales_end_at).getTime() / 1000) === settings.salesEndSec
  );
}

export const SETTINGS_ERRORS = {
  notAdmin: "This wallet doesn't have the platform's admin role, so it can't change event settings. Use the platform's admin wallet.",
  endTime: "Sales must end in the future. Choose a later date and time, then try again.",
  royalty: "The royalty can't be more than 100%.",
  resaleCap: "The resale cap must be no cap or at least 1× face value.",
  notConfigured: "This event isn't set up on the contract yet, so it has no settings to change.",
};

export function getSettingsErrorMessage(err: unknown): string {
  return getTransactionErrorMessage(err, {
    revertReasons: {
      "End time must be in the future": SETTINGS_ERRORS.endTime,
      "Royalty cannot exceed 100%": SETTINGS_ERRORS.royalty,
      "Resale cap must be 0": SETTINGS_ERRORS.resaleCap,
      "Event not configured": SETTINGS_ERRORS.notConfigured,
    },
    // OpenZeppelin v5 custom error, included in the contract ABI
    customErrors: { AccessControlUnauthorizedAccount: SETTINGS_ERRORS.notAdmin },
  });
}
