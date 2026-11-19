// Organizer manage page (#189-#194): API calls, ticket table types, wallet-list parsing and the
// small display helpers. Kept free of React so the rules can be unit tested.

import { isAddress, parseUnits } from "viem";

import { ApiError, apiClient } from "@/lib/api";
import type { OrganizerEvent } from "@/lib/organizer-events";
import { formatTokenAmount } from "@/lib/token-amount";

// TicketNFT's batch calls (batchAddToWhitelist, issueTickets) accept at most 100 wallets.
export const MAX_BATCH_SIZE = 100;
export const TICKETS_PAGE_SIZE = 10;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface ManageTicketType {
  id: string;
  name: string;
  contract_type_id: number | null;
}

export interface ManageTicket {
  token_id: string;
  owner_wallet: string;
  status: "VALID" | "USED";
  used_at: string | null;
  minted_at: string;
  face_value: string | null;
  purchase_price: string | null; // null for tickets the organizer issued for free
  listing_price: string | null;
  kind: "sale" | "issued";
  ticket_type: ManageTicketType;
}

export interface TicketSummary {
  total: number;
  sold: number;
  issued: number;
  valid: number;
  used: number;
}

export interface EventTickets {
  tickets: ManageTicket[];
  summary: TicketSummary;
  total: number; // matching the filters, for paging
  page: number;
  limit: number;
}

export interface TicketQuery {
  page?: number;
  limit?: number;
  status?: "VALID" | "USED";
  kind?: "sale" | "issued";
  ticketTypeId?: string;
}

export interface WhitelistEntry {
  id: string;
  event_id: string;
  wallet: string;
  added_by: string;
  synced_to_chain: boolean;
  created_at: string;
}

export interface ScannerEntry {
  id: string;
  event_id: string;
  wallet: string;
  assigned_by: string;
  synced_to_chain: boolean;
  created_at: string;
}

interface RequestOptions {
  method?: string;
  data?: unknown;
}

type Request = <T>(path: string, options?: RequestOptions) => Promise<T>;
const defaultRequest: Request = (path, options) => apiClient(path, options);

const eventPath = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}`;

// GET /api/events/:id: the same public event shape, including the organizer and sale fields
export function fetchOrganizerEvent(eventId: string, request: Request = defaultRequest): Promise<OrganizerEvent> {
  return request<OrganizerEvent>(eventPath(eventId));
}

// GET /api/events/:id/tickets (#190)
export function fetchEventTickets(
  eventId: string,
  query: TicketQuery = {},
  request: Request = defaultRequest
): Promise<EventTickets> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.status) params.set("status", query.status);
  if (query.kind) params.set("kind", query.kind);
  if (query.ticketTypeId) params.set("ticket_type_id", query.ticketTypeId);
  const suffix = params.toString();

  return request<EventTickets>(`${eventPath(eventId)}/tickets${suffix ? `?${suffix}` : ""}`);
}

// Guest list and scanners: the DB rows are written first for additions, then the chain call is
// made from the organizer's wallet. The listener marks rows synced (or removes them).
export function fetchWhitelist(eventId: string, request: Request = defaultRequest): Promise<WhitelistEntry[]> {
  return request<WhitelistEntry[]>(`${eventPath(eventId)}/whitelist`);
}

export function addToWhitelist(eventId: string, wallets: string[], request: Request = defaultRequest): Promise<{ count: number }> {
  return request<{ count: number }>(`${eventPath(eventId)}/whitelist`, { method: "POST", data: { wallets } });
}

export function removeFromWhitelist(eventId: string, wallet: string, request: Request = defaultRequest): Promise<{ message: string }> {
  return request<{ message: string }>(`${eventPath(eventId)}/whitelist/${encodeURIComponent(wallet)}`, { method: "DELETE" });
}

export function fetchScanners(eventId: string, request: Request = defaultRequest): Promise<ScannerEntry[]> {
  return request<ScannerEntry[]>(`${eventPath(eventId)}/scanners`);
}

export function addScanner(eventId: string, wallet: string, request: Request = defaultRequest): Promise<ScannerEntry> {
  return request<ScannerEntry>(`${eventPath(eventId)}/scanners`, { method: "POST", data: { wallet } });
}

export function removeScanner(eventId: string, wallet: string, request: Request = defaultRequest): Promise<{ message: string }> {
  return request<{ message: string }>(`${eventPath(eventId)}/scanners/${encodeURIComponent(wallet)}`, { method: "DELETE" });
}

export interface WalletListResult {
  wallets: string[]; // lowercased, in the order they were entered, without duplicates
  duplicates: number;
  error: string | null;
}

// Reads the textarea used by the guest list and free tickets: one address per line, or separated
// by commas/spaces. Invalid entries stop the whole batch, like the API and the contract.
export function parseWalletList(input: string, limit = MAX_BATCH_SIZE): WalletListResult {
  const parts = input
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { wallets: [], duplicates: 0, error: "Enter at least one wallet address." };
  }

  const wallets: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const part of parts) {
    if (!isAddress(part, { strict: false })) {
      return { wallets: [], duplicates: 0, error: `"${part}" is not a valid wallet address.` };
    }
    const wallet = part.toLowerCase();
    if (wallet === ZERO_ADDRESS) {
      return { wallets: [], duplicates: 0, error: "The zero address can't receive tickets or be added to the guest list." };
    }
    if (seen.has(wallet)) {
      duplicates += 1;
      continue;
    }
    seen.add(wallet);
    wallets.push(wallet);
  }

  if (wallets.length > limit) {
    return { wallets, duplicates, error: `Add at most ${limit} wallets at a time.` };
  }

  return { wallets, duplicates, error: null };
}

// The API's error text, with the cases the organizer can act on made explicit
export function manageApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) {
      return "Every wallet needs a finished platform account (name and email) before it can be added. Nothing was sent on-chain.";
    }
    if (err.status === 403) return "Only this event's organizer can do that. Sign in with the wallet that created the event.";
    return err.message;
  }
  return "Could not reach the server. Check your connection and try again.";
}

// The API stores prices as decimal USDC strings ("25", "25.00000000"); the table shows them like
// the rest of the app, or "Free" for tickets the organizer issued.
export function formatTicketPrice(value: string | null, decimals = 6): string {
  if (value === null) return "Free";
  try {
    return `${formatTokenAmount(parseUnits(value, decimals), decimals)} USDC`;
  } catch {
    return `${value} USDC`;
  }
}

// Explorer link for the contract address (#189); local chains have no explorer
export function explorerAddressUrl(explorerUrl: string | null | undefined, address: string): string | null {
  if (!explorerUrl) return null;
  return `${explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

// How many tickets of a type can still be issued or sold
export function ticketsLeft(type: { maxSupply: number; sold: number; issued: number }): number {
  return Math.max(0, type.maxSupply - type.sold - type.issued);
}

// A wallet that's already on the guest list or already a scanner doesn't need another chain call
export function walletsMissingFrom(existing: Array<{ wallet: string }>, wallets: string[]): string[] {
  const known = new Set(existing.map((entry) => entry.wallet.toLowerCase()));
  return wallets.filter((wallet) => !known.has(wallet.toLowerCase()));
}
