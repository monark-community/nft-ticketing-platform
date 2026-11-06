// Marketplace (#295): resale listings, selling and buying a resold ticket. Kept free of React so
// every rule can be unit tested. Amounts are bigint in USDC's smallest unit; the API sends prices
// as decimal strings (Prisma Decimal), which are converted once, here.

import { parseUnits } from "viem";

import type { AlertTone } from "@/components/ui/alert";
import { formatEth, formatTokenAmount } from "@/lib/token-amount";

// --- GET /api/listings -------------------------------------------------------------------------

export interface ListingEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  category: string | null;
  image_url: string | null;
  contract_event_id: string | null;
  resale_cap_bps: number | null;
  royalty_bps: number | null;
  per_wallet_limit: number | null;
  sales_end_at: string | null;
}

export interface Listing {
  token_id: string;
  seller_wallet: string;
  price: string; // USDC
  listed_at: string;
  used: boolean;
  collectible: boolean; // used, or the event is over: no price cap
  max_price: string | null; // USDC; null when no cap applies
  ticket_type: { id: string; name: string; contract_type_id: number | null; face_value: string };
  event: ListingEvent;
}

export interface ListingsPage {
  listings: Listing[];
  total: number;
  page: number;
  limit: number;
}

export const LISTING_SORTS = [
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
  { value: "newest", label: "Newest" },
  { value: "event_date", label: "Event date" },
] as const;

export type ListingSort = (typeof LISTING_SORTS)[number]["value"];

export interface ListingFilters {
  q: string; // event title or seller wallet
  eventId: string; // "" = all events
  category: string; // "" = all categories
  sort: ListingSort;
}

export const DEFAULT_FILTERS: ListingFilters = { q: "", eventId: "", category: "", sort: "price_asc" };

export function hasActiveFilters(filters: ListingFilters): boolean {
  return filters.q.trim() !== "" || filters.eventId !== "" || filters.category !== "";
}

// The query string for GET /api/listings. Empty filters are left out.
export function listingsPath(filters: ListingFilters, page: number, limit: number, seller?: string): string {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), sort: filters.sort });
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.eventId) params.set("event_id", filters.eventId);
  if (filters.category) params.set("category", filters.category);
  if (seller) params.set("seller", seller);
  return `/api/listings?${params.toString()}`;
}

// Merge a newly loaded page, skipping listings already shown (the list can shift between requests)
export function appendListings(current: Listing[], next: Listing[]): Listing[] {
  const seen = new Set(current.map((l) => l.token_id));
  return [...current, ...next.filter((l) => !seen.has(l.token_id))];
}

// --- GET /api/tickets/owner/:address (the tickets the Sell popup offers) ------------------------

export interface SellableTicket {
  token_id: string;
  owner_wallet: string;
  status: "VALID" | "USED";
  used_at: string | null;
  face_value: string | null;
  listing_price: string | null; // USDC, when already listed
  event: {
    id: string;
    contract_event_id: string | null;
    title: string;
    location: string | null;
    start_date: string;
    end_date: string | null;
    image_url: string | null;
    resale_cap_bps: number | null;
    royalty_bps: number | null;
    sales_end_at: string | null;
  };
  ticket_type: { id: string; name: string; contract_type_id: number | null };
}

// Used tickets and tickets after the event are collectibles: the contract lifts the price cap
// (resaleCapApplies). Shown as "Collectible · no price cap".
export function isCollectible(ticket: SellableTicket, nowMs: number): boolean {
  if (ticket.status === "USED") return true;
  const end = ticket.event.sales_end_at ? new Date(ticket.event.sales_end_at).getTime() : NaN;
  return Number.isFinite(end) && nowMs >= end;
}

// Tickets that can be listed: on-chain events only. Listed ones stay, so their price can change.
export function sellableTickets(tickets: SellableTicket[]): SellableTicket[] {
  return tickets.filter((t) => t.event.contract_event_id !== null);
}

// --- Money ---------------------------------------------------------------------------------------

export const BPS = 10_000;

// An API decimal string ("22.5", "15.00000000") in the token's smallest unit
export function toUnits(value: string | number | null | undefined, decimals: number): bigint {
  if (value === null || value === undefined) return BigInt(0);
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return BigInt(0);
  const fraction = (match[2] ?? "").slice(0, decimals); // the DB keeps 8 decimals, USDC has 6
  return parseUnits(fraction ? `${match[1]}.${fraction}` : match[1], decimals);
}

export function formatUsdc(value: bigint, decimals: number): string {
  return `${formatTokenAmount(value, decimals)} USDC`;
}

// The organizer's royalty is taken from the price, like the contract's royaltyInfo():
// royalty = price × bps / 10000, rounded down; the seller gets the rest.
export function royaltySplit(price: bigint, royaltyBps: number): { royalty: bigint; sellerReceives: bigint } {
  const royalty = (price * BigInt(royaltyBps)) / BigInt(BPS);
  return { royalty, sellerReceives: price - royalty };
}

// "10%", "2.5%"
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

// How much of the cap the price uses, for the bar and the "73.3% of cap" label. null without a cap.
export function capShare(price: bigint, max: bigint | null): number | null {
  if (max === null || max <= BigInt(0)) return null;
  return Number((price * BigInt(10_000)) / max) / 100;
}

export type PriceInput = { ok: true; value: bigint } | { ok: false; error: string | null };

// The seller's price as typed. error is null for an empty field (nothing to complain about yet).
export function parsePrice(text: string, decimals: number): PriceInput {
  const value = text.trim();
  if (value === "") return { ok: false, error: null };
  if (!new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`).test(value)) {
    return { ok: false, error: `Enter a price in USDC, with up to ${decimals} decimals.` };
  }
  const units = parseUnits(value.endsWith(".") ? value.slice(0, -1) : value, decimals);
  if (units <= BigInt(0)) return { ok: false, error: "The price must be more than 0." };
  return { ok: true, value: units };
}

// listForResale() rejects a price over maxResalePriceOf() while the cap applies
export function priceOverCap(price: bigint, capApplies: boolean, max: bigint): boolean {
  return capApplies && price > max;
}

// --- Buying a resold ticket ----------------------------------------------------------------------

// Gas measured on the local Hardhat node: approve ~46k, buyResaleTicket ~95k (a first buy for the
// event writes more). Rounded up. Only used for the fee estimate and the "not enough ETH" check.
export const RESALE_APPROVE_GAS = BigInt(60_000);
export const RESALE_BUY_GAS = BigInt(150_000);
export const LIST_GAS = BigInt(110_000);

export function estimateResaleGas(needsApproval: boolean): bigint {
  return needsApproval ? RESALE_APPROVE_GAS + RESALE_BUY_GAS : RESALE_BUY_GAS;
}

// The listing as the contract has it now (listings(tokenId)), which may differ from the API's copy
export interface OnChainListing {
  seller: string; // the zero address when not listed
  price: bigint;
  royaltyBps: number; // the royalty when it was listed
}

export interface ResaleBuyInput {
  listing: OnChainListing;
  currentRoyaltyBps: number; // royaltyPercentage(event) now
  capApplies: boolean;
  maxPrice: bigint;
  isConnected: boolean;
  onContractChain: boolean;
  wallet: string | undefined;
  // Same rule as a first-hand purchase: buyers need an account with an email (Monark).
  // Checked here, in the frontend: the purchase itself goes straight to the contract.
  signedIn: boolean;
  profileComplete: boolean;
  perWalletLimit: number; // 0 = no limit
  held: number; // tickets this wallet already holds for the event
  usdcBalance: bigint;
  ethBalance: bigint;
  ethNeeded: bigint;
}

export type ResaleBuyBlock =
  | { reason: "notListed" }
  | { reason: "ownListing" }
  | { reason: "royaltyChanged" }
  | { reason: "overCap" }
  | { reason: "notConnected" }
  | { reason: "wrongNetwork" }
  | { reason: "notSignedIn" }
  | { reason: "profileIncomplete" }
  | { reason: "walletLimit"; limit: number; held: number }
  | { reason: "notEnoughUsdc"; total: bigint; balance: bigint }
  | { reason: "notEnoughEth"; needed: bigint; balance: bigint };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// The first reason the purchase can't go ahead, or null when it can. Listing-wide reasons first,
// in the order of the contract's own require() checks in buyResaleTicket().
export function getResaleBuyBlock(input: ResaleBuyInput): ResaleBuyBlock | null {
  if (input.listing.seller.toLowerCase() === ZERO_ADDRESS) return { reason: "notListed" };
  if (input.wallet && input.listing.seller.toLowerCase() === input.wallet.toLowerCase()) return { reason: "ownListing" };
  if (input.listing.royaltyBps !== input.currentRoyaltyBps) return { reason: "royaltyChanged" };
  if (input.capApplies && input.listing.price > input.maxPrice) return { reason: "overCap" };

  if (!input.isConnected) return { reason: "notConnected" };
  if (!input.onContractChain) return { reason: "wrongNetwork" };
  if (!input.signedIn) return { reason: "notSignedIn" };
  if (!input.profileComplete) return { reason: "profileIncomplete" };
  if (input.perWalletLimit > 0 && input.held + 1 > input.perWalletLimit) {
    return { reason: "walletLimit", limit: input.perWalletLimit, held: input.held };
  }
  if (input.usdcBalance < input.listing.price) {
    return { reason: "notEnoughUsdc", total: input.listing.price, balance: input.usdcBalance };
  }
  if (input.ethBalance < input.ethNeeded) {
    return { reason: "notEnoughEth", needed: input.ethNeeded, balance: input.ethBalance };
  }
  return null;
}

export interface ResaleBlockMessage {
  tone: AlertTone;
  title: string;
  message: string;
}

// What to tell the buyer for each block. Every message says what to do next (#282).
export function getResaleBlockMessage(block: ResaleBuyBlock, options: { usdcDecimals: number; chainName: string }): ResaleBlockMessage {
  const usdc = (value: bigint) => formatUsdc(value, options.usdcDecimals);

  switch (block.reason) {
    case "notListed":
      return {
        tone: "info",
        title: "This ticket is no longer for sale",
        message: "It was just bought or the seller took it off the Marketplace. Pick another listing.",
      };
    case "ownListing":
      return {
        tone: "info",
        title: "This is your listing",
        message: "You can change its price or cancel it under Your listings.",
      };
    case "royaltyChanged":
      return {
        tone: "warning",
        title: "The royalty changed after this ticket was listed",
        message: "It can't be bought until the seller lists it again with the new terms. Pick another listing.",
      };
    case "overCap":
      return {
        tone: "warning",
        title: "Above the event's price cap",
        message: "The organizer lowered the resale cap after this ticket was listed. Pick another listing.",
      };
    case "notConnected":
      return { tone: "info", title: "Connect your wallet to buy", message: "The ticket is sent to the wallet you connect." };
    case "wrongNetwork":
      return { tone: "warning", title: "Wrong network", message: `Switch your wallet to ${options.chainName} to buy this ticket.` };
    case "notSignedIn":
      return {
        tone: "info",
        title: "Sign in to buy",
        message: "Sign a free message in your wallet to log in. Tickets are linked to your account.",
      };
    case "profileIncomplete":
      return {
        tone: "info",
        title: "Finish your account to buy",
        message: "Add your name and email first. It only takes a moment, and you'll come back here.",
      };
    case "walletLimit":
      return {
        tone: "warning",
        title: "Wallet limit reached",
        message: `You can hold up to ${block.limit} tickets for this event, and you already have ${block.held}.`,
      };
    case "notEnoughUsdc":
      return {
        tone: "warning",
        title: "Not enough USDC",
        message: `This ticket costs ${usdc(block.total)} and your wallet has ${usdc(block.balance)}. Add ${usdc(block.total - block.balance)} to buy it.`,
      };
    case "notEnoughEth":
      return {
        tone: "warning",
        title: "Not enough ETH for the network fee",
        message: `Add about ${formatEth(block.needed - block.balance)} ETH to this wallet, then try again.`,
      };
  }
}

// "2 of 4" after buying one more, "No limit", or "4 per wallet" before a wallet is connected
export function walletLimitLabel(perWalletLimit: number, held: number | null): string {
  if (perWalletLimit === 0) return "No limit";
  if (held === null) return `${perWalletLimit} per wallet`;
  return `${Math.min(held + 1, perWalletLimit)} of ${perWalletLimit}`;
}
