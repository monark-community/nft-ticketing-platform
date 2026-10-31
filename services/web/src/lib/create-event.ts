// Create event flow (#187, #188): the form's rules, the API payloads and the totals.
// Kept free of React so it can be unit tested. Going on-chain is in publish-event.ts (#193).

import { parseUnits } from "viem";

import { formatEventDate, formatEventTime, type ApiEvent, type ApiTicketType } from "@/lib/event-details";

// One fixed list for the create-event dropdown, the filters and the badges (#282)
export const EVENT_CATEGORIES = [
  "Concerts",
  "Theater & Arts",
  "Sports & Arenas",
  "Web3 & Tech",
  "Classical & Opera",
  "Electronic Music",
  "Culture & Rodeo",
] as const;

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const VENUE_MAX = 200;
export const TYPE_NAME_MAX = 60;
export const TYPE_DESCRIPTION_MAX = 500;
export const MAX_TICKET_TYPES = 10;
export const MAX_SUPPLY = 2_147_483_647; // TicketType.supply is a Postgres INTEGER
export const MAX_PER_WALLET = 10_000;
const API_PRICE_DECIMALS = 8; // TicketType.price is Decimal(18, 8)
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // same limit as the API's freeze upload
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
// Events without an end date count as over this long after they start (same rule as My Tickets)
export const NO_END_DATE_GRACE_MS = 12 * 60 * 60 * 1000;

// Resale cap options (contract: 0 = no cap, otherwise at least 100% of face value)
export const RESALE_CAP_OPTIONS = [
  { bps: 0, label: "No cap" },
  { bps: 10_000, label: "1× face value" },
  { bps: 15_000, label: "1.5× face value" },
  { bps: 20_000, label: "2× face value" },
  { bps: 30_000, label: "3× face value" },
] as const;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

// ---------------------------------------------------------------------------------------------
// Dates. The forms use <input type="datetime-local">, which has no time zone: values are the
// organizer's local time, and are sent to the API as ISO (UTC) strings.

// "2027-03-06T18:00" (local time) from a timestamp, for the input's value
export function localInputFromMs(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Same, from the API's ISO strings
export function toLocalInput(iso: string | null | undefined): string {
  return iso ? localInputFromMs(new Date(iso).getTime()) : "";
}

// The input's value (local time) as a timestamp, or null if empty or invalid
export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// ---------------------------------------------------------------------------------------------
// Step 1: details

export interface DetailsForm {
  title: string;
  description: string;
  category: string;
  location: string;
  start: string; // datetime-local
  end: string; // datetime-local, optional
}

export const EMPTY_DETAILS: DetailsForm = { title: "", description: "", category: "", location: "", start: "", end: "" };

export function validateDetails(form: DetailsForm, nowMs: number): FieldErrors<keyof DetailsForm> {
  const errors: FieldErrors<keyof DetailsForm> = {};
  const title = form.title.trim();
  if (!title) errors.title = "Enter the event name.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the name under ${TITLE_MAX} characters.`;

  if (form.description.length > DESCRIPTION_MAX) errors.description = `Keep the description under ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.`;

  if (!(EVENT_CATEGORIES as readonly string[]).includes(form.category)) errors.category = "Choose a category.";

  const venue = form.location.trim();
  if (!venue) errors.location = "Enter the venue.";
  else if (venue.length > VENUE_MAX) errors.location = `Keep the venue under ${VENUE_MAX} characters.`;

  const start = fromLocalInput(form.start);
  if (start === null) errors.start = "Choose when the event starts.";
  else if (start <= nowMs) errors.start = "The start must be in the future.";

  if (form.end) {
    const end = fromLocalInput(form.end);
    if (end === null) errors.end = "Enter a valid end time, or leave it empty.";
    else if (start !== null && end <= start) errors.end = "The end must be after the start.";
  }
  return errors;
}

export function validateCoverImage(file: { type: string; size: number } | null): string | null {
  if (!file) return "Add a cover image. It's uploaded to IPFS when you publish.";
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPG or WebP image.";
  if (file.size > IMAGE_MAX_BYTES) return "The image must be 10 MB or smaller.";
  return null;
}

// Body for POST /api/events and PUT /api/events/:id. A cleared end date is sent as null so the
// API removes it.
export function toEventPayload(form: DetailsForm) {
  const start = fromLocalInput(form.start);
  const end = fromLocalInput(form.end);
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category,
    location: form.location.trim(),
    start_date: start === null ? "" : new Date(start).toISOString(),
    end_date: end === null ? null : new Date(end).toISOString(),
  };
}

export function detailsFromEvent(event: ApiEvent): DetailsForm {
  return {
    title: event.title,
    description: event.description ?? "",
    category: event.category ?? "",
    location: event.location ?? "",
    start: toLocalInput(event.start_date),
    end: toLocalInput(event.end_date),
  };
}

// Review row (Figma "When"): "Sat, Mar 6, 2027 • 6:00 PM to 9:30 PM", with the end's date too
// when it's on another day. Pass a time zone for tests.
export function formatEventWhen(startMs: number, endMs: number | null, timeZone?: string): string {
  const start = new Date(startMs).toISOString();
  const from = formatEventDate(start, timeZone);
  if (endMs === null) return from;
  const end = new Date(endMs).toISOString();
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "numeric", day: "numeric", timeZone });
  return day(start) === day(end) ? `${from} to ${formatEventTime(end, timeZone)}` : `${from} to ${formatEventDate(end, timeZone)}`;
}

// When the event is over: its end date, or 12 hours after the start without one
export function eventEndMs(details: DetailsForm): number | null {
  const end = fromLocalInput(details.end);
  if (end !== null) return end;
  const start = fromLocalInput(details.start);
  return start === null ? null : start + NO_END_DATE_GRACE_MS;
}

// ---------------------------------------------------------------------------------------------
// Step 2: ticket types

export interface TicketTypeForm {
  key: string; // stable key for React and errors
  id: string | null; // API id once saved
  name: string;
  price: string; // USDC, as typed: "15" or "15.00"
  supply: string;
  description: string;
}

export type TicketTypeErrors = FieldErrors<"name" | "price" | "supply" | "description">;

let keyCounter = 0;
export function newTicketType(name = ""): TicketTypeForm {
  keyCounter += 1;
  return { key: `new-${keyCounter}`, id: null, name, price: "", supply: "", description: "" };
}

// "15", "15.5" or "15.50" -> the token's smallest unit. null if it isn't a plain amount with at
// most `decimals` decimal places (USDC has 6).
export function parsePrice(value: string, decimals: number): bigint | null {
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const fraction = text.split(".")[1] ?? "";
  if (fraction.length > decimals) return null;
  try {
    return parseUnits(text, decimals);
  } catch {
    return null;
  }
}

export function parseSupply(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

export function validateTicketTypes(types: TicketTypeForm[], decimals: number) {
  const rows: Record<string, TicketTypeErrors> = {};
  let list: string | null = null;

  if (types.length === 0) list = "Add at least one ticket type.";
  else if (types.length > MAX_TICKET_TYPES) list = `An event can have up to ${MAX_TICKET_TYPES} ticket types.`;

  const seen = new Map<string, string>();
  for (const type of types) {
    const errors: TicketTypeErrors = {};
    const name = type.name.trim();
    if (!name) errors.name = "Enter a name.";
    else if (name.length > TYPE_NAME_MAX) errors.name = `Keep it under ${TYPE_NAME_MAX} characters.`;
    else if (seen.has(name.toLowerCase())) errors.name = "Another ticket type has this name.";
    else seen.set(name.toLowerCase(), type.key);

    const price = parsePrice(type.price, decimals);
    if (price === null) errors.price = `Enter a price like 15 or 15.50 (up to ${decimals} decimals).`;
    else if (price > parseUnits("1000000", decimals)) errors.price = "Keep the price at 1,000,000 USDC or less.";

    const supply = parseSupply(type.supply);
    if (supply === null || supply < 1) errors.supply = "Enter a whole number, 1 or more.";
    else if (supply > MAX_SUPPLY) errors.supply = "That's more tickets than an event can have.";

    if (type.description.length > TYPE_DESCRIPTION_MAX) errors.description = `Keep it under ${TYPE_DESCRIPTION_MAX} characters.`;

    if (Object.keys(errors).length > 0) rows[type.key] = errors;
  }
  return { rows, list, ok: list === null && Object.keys(rows).length === 0 };
}

// Body for POST /api/events/:id/ticket-types and PUT /api/ticket-types/:id
export function toTicketTypePayload(type: TicketTypeForm) {
  return {
    name: type.name.trim(),
    description: type.description.trim(),
    price: type.price.trim(),
    supply: parseSupply(type.supply) ?? 0,
  };
}

// The API sends prices as decimal strings like "15.00000000"
export function ticketTypeFromApi(type: ApiTicketType): TicketTypeForm {
  return {
    key: type.id,
    id: type.id,
    name: type.name,
    price: trimDecimal(type.price),
    supply: String(type.supply),
    description: type.description ?? "",
  };
}

function trimDecimal(value: string): string {
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
}

// What a save has to send to the API to match the form: create new rows, update changed ones,
// delete removed ones. Rows are created in list order, which becomes their on-chain type order.
export function planTicketTypeSync(form: TicketTypeForm[], saved: ApiTicketType[]) {
  const savedById = new Map(saved.map((t) => [t.id, t]));
  const keep = new Set(form.filter((t) => t.id).map((t) => t.id as string));

  const create = form.filter((t) => !t.id || !savedById.has(t.id));
  const update = form.filter((t) => {
    if (!t.id) return false;
    const old = savedById.get(t.id);
    if (!old) return false;
    return (
      old.name !== t.name.trim() ||
      (old.description ?? "") !== t.description.trim() ||
      old.supply !== parseSupply(t.supply) ||
      // Compare as amounts: the API sends "15.00000000" for "15" (the column has 8 decimals)
      parsePrice(old.price, API_PRICE_DECIMALS) !== parsePrice(t.price, API_PRICE_DECIMALS)
    );
  });
  const remove = saved.filter((t) => !keep.has(t.id)).map((t) => t.id);
  return { create, update, remove };
}

export function ticketTotals(types: TicketTypeForm[], decimals: number) {
  let capacity = 0;
  let revenue = BigInt(0);
  for (const type of types) {
    const supply = parseSupply(type.supply);
    const price = parsePrice(type.price, decimals);
    if (supply === null || supply < 1) continue;
    capacity += supply;
    if (price !== null) revenue += price * BigInt(supply);
  }
  return { count: types.length, capacity, revenue };
}

// ---------------------------------------------------------------------------------------------
// Step 3: sale rules (stored in the browser until they go on-chain; the API doesn't have them yet)

export interface SaleRulesForm {
  perWalletLimit: string; // "0" = no limit
  salesEnd: string; // datetime-local
  resaleCapBps: number;
  royaltyPercent: string;
  presale: boolean;
}

// Figma defaults. Sales end when the event starts: the contract also stops capping resale prices
// then ("Applies before the event").
export function defaultSaleRules(details: DetailsForm): SaleRulesForm {
  return { perWalletLimit: "4", salesEnd: details.start, resaleCapBps: 20_000, royaltyPercent: "10", presale: false };
}

export function parseRoyaltyBps(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const bps = Math.round(Number(text) * 100);
  return bps <= 10_000 ? bps : null;
}

export function validateSaleRules(rules: SaleRulesForm, details: DetailsForm, nowMs: number): FieldErrors<keyof SaleRulesForm> {
  const errors: FieldErrors<keyof SaleRulesForm> = {};
  const limit = parseSupply(rules.perWalletLimit);
  if (limit === null) errors.perWalletLimit = "Enter a whole number. 0 means no limit.";
  else if (limit > MAX_PER_WALLET) errors.perWalletLimit = `Keep it at ${MAX_PER_WALLET.toLocaleString("en-US")} or less.`;

  const salesEnd = fromLocalInput(rules.salesEnd);
  const eventEnd = eventEndMs(details);
  if (salesEnd === null) errors.salesEnd = "Choose when ticket sales end.";
  else if (salesEnd <= nowMs) errors.salesEnd = "Sales must end in the future.";
  else if (eventEnd !== null && salesEnd > eventEnd) errors.salesEnd = "Sales must end by the time the event ends.";

  if (!RESALE_CAP_OPTIONS.some((o) => o.bps === rules.resaleCapBps)) errors.resaleCapBps = "Choose a resale cap.";
  if (parseRoyaltyBps(rules.royaltyPercent) === null) errors.royaltyPercent = "Enter a percentage from 0 to 100 (up to 2 decimals).";
  return errors;
}

export function resaleCapLabel(bps: number): string {
  return RESALE_CAP_OPTIONS.find((o) => o.bps === bps)?.label ?? `${bps / 10_000}× face value`;
}

// The arguments configureEvent() takes, from the form
export interface ChainSettings {
  endTime: bigint; // unix seconds
  royaltyBps: bigint;
  resaleCapBps: bigint;
  perWalletLimit: bigint;
}

export function toChainSettings(rules: SaleRulesForm): ChainSettings | null {
  const end = fromLocalInput(rules.salesEnd);
  const royalty = parseRoyaltyBps(rules.royaltyPercent);
  const limit = parseSupply(rules.perWalletLimit);
  if (end === null || royalty === null || limit === null) return null;
  return {
    endTime: BigInt(Math.floor(end / 1000)),
    royaltyBps: BigInt(royalty),
    resaleCapBps: BigInt(rules.resaleCapBps),
    perWalletLimit: BigInt(limit),
  };
}

// Only accepts what this page saved, so a bad value in storage falls back to the defaults
export function parseStoredSaleRules(value: string | null): SaleRulesForm | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value);
    if (
      typeof v?.perWalletLimit === "string" &&
      typeof v.salesEnd === "string" &&
      typeof v.resaleCapBps === "number" &&
      typeof v.royaltyPercent === "string" &&
      typeof v.presale === "boolean"
    ) {
      return { perWalletLimit: v.perWalletLimit, salesEnd: v.salesEnd, resaleCapBps: v.resaleCapBps, royaltyPercent: v.royaltyPercent, presale: v.presale };
    }
  } catch {
    // fall through
  }
  return null;
}

// "A VIP ticket (28.00 USDC) can be resold for up to 56.00 USDC before the event. You receive 10%
// of each resale." Uses the most expensive ticket type.
export function resaleExample(types: TicketTypeForm[], rules: SaleRulesForm, decimals: number, format: (v: bigint) => string): string {
  const royalty = parseRoyaltyBps(rules.royaltyPercent);
  const royaltyText =
    royalty === null ? "" : royalty === 0 ? " You don't receive a royalty on resales." : ` You receive ${Number((royalty / 100).toFixed(2))}% of each resale.`;
  let top: { name: string; price: bigint } | null = null;
  for (const type of types) {
    const price = parsePrice(type.price, decimals);
    if (price !== null && type.name.trim() && (!top || price > top.price)) top = { name: type.name.trim(), price };
  }
  if (!top) return `Resale prices follow the cap you choose.${royaltyText}`;
  const article = /^[aeiou]/i.test(top.name) ? "An" : "A";
  if (rules.resaleCapBps === 0) {
    return `${article} ${top.name} ticket (${format(top.price)} USDC) can be resold at any price.${royaltyText}`;
  }
  const cap = (top.price * BigInt(rules.resaleCapBps)) / BigInt(10_000);
  return `${article} ${top.name} ticket (${format(top.price)} USDC) can be resold for up to ${format(cap)} USDC before the event.${royaltyText}`;
}

// ---------------------------------------------------------------------------------------------
// Steps of the form

export const FORM_STEPS = ["details", "ticket-types", "sale-rules", "review"] as const;
export type FormStep = (typeof FORM_STEPS)[number];
export const STEP_LABELS: Record<FormStep, string> = {
  details: "Details",
  "ticket-types": "Ticket types",
  "sale-rules": "Sale rules",
  review: "Review and publish",
};

export function parseStep(value: string | null): FormStep {
  return (FORM_STEPS as readonly string[]).includes(value ?? "") ? (value as FormStep) : "details";
}
