// Event page data (#284): the API's event shape, joining it with the contract's ticket types,
// and display helpers. Kept free of React so it can be unit tested.

import { parseUnits } from "viem";
import { ticketsRemaining } from "@/lib/ticket-stock";

// GET /api/events/:id (services/api event.service getEventById). BigInts arrive as strings and
// Decimals as strings, because of the API's JSON settings.
export interface ApiTicketType {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: string; // e.g. "15" or "15.00000000"
  supply: number;
  sold: number;
  created_at: string;
}

export interface ApiEvent {
  id: string;
  organizer_wallet: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string | null;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  contract_event_id: string | null;
  status: "DRAFT" | "FROZEN" | "PUBLISHED";
  ticket_types: ApiTicketType[];
}

// ticketTypes(eventId, typeId) on TicketNFT
export interface OnChainTicketType {
  typeId: number;
  price: bigint;
  maxSupply: number;
  sold: number;
  issued: number;
}

// One ticket type as the page shows it: name and description from the API, numbers from the chain
export interface EventTier {
  key: string;
  typeId: number;
  name: string;
  description: string | null;
  price: bigint; // USDC's smallest unit
  supply: number;
  remaining: number;
}

// The API returns ticket types in no particular order. They are created in the same order as on
// the contract, so creation order gives each row's on-chain type ID.
// TODO(#216): match on contract_type_id once the API stores it, instead of relying on order.
export function sortTicketTypes(types: ApiTicketType[]): ApiTicketType[] {
  return [...types].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function buildTiers(apiTypes: ApiTicketType[], chainTypes: OnChainTicketType[] | null, usdcDecimals: number): EventTier[] {
  const sorted = sortTicketTypes(apiTypes);

  // On-chain: the contract decides which types exist, their price and supply
  if (chainTypes && chainTypes.length > 0) {
    return chainTypes.map((type) => {
      const details = sorted[type.typeId];
      return {
        key: details?.id ?? `type-${type.typeId}`,
        typeId: type.typeId,
        name: details?.name ?? `Ticket type ${type.typeId + 1}`,
        description: details?.description ?? null,
        price: type.price,
        supply: type.maxSupply,
        remaining: ticketsRemaining(type),
      };
    });
  }

  // Not on-chain yet: show the API's types so the page isn't empty (buying stays blocked)
  return sorted.map((type, typeId) => ({
    key: type.id,
    typeId,
    name: type.name,
    description: type.description,
    price: parseDecimal(type.price, usdcDecimals),
    supply: type.supply,
    remaining: Math.max(0, type.supply - type.sold),
  }));
}

function parseDecimal(value: string, decimals: number): bigint {
  try {
    return parseUnits(value, decimals);
  } catch {
    return BigInt(0);
  }
}

// "Sat, Mar 6, 2027 • 6:00 PM" in the viewer's time zone (pass one for tests)
export function formatEventDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone });
  return `${day} • ${formatEventTime(iso, timeZone)}`;
}

// "6:00 PM"
export function formatEventTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

// "3h", "2h 15m" or "45m"; null when there is no end date or it is not after the start
export function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const minutes = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
  if (!(minutes > 0)) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud";

// Event images may be a normal URL or an ipfs:// URI (#126); browsers can only load the first
export function eventImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("ipfs://")) return `${IPFS_GATEWAY}/ipfs/${imageUrl.slice("ipfs://".length)}`;
  return imageUrl;
}

// Contract basis points to display text: resale cap 20000 -> "2×", royalty 1000 -> "10%"
export function formatMultiplier(bps: number): string {
  return `${Number((bps / 10_000).toFixed(2))}×`;
}

export function formatPercent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}
