// Stock rules for ticket types (#284). Shared, so the event page, the events list and the
// organizer dashboard all call a type "low stock" at the same point.

// A type is low on stock once 35% or less of its supply is left
export const LOW_STOCK_RATIO = 0.35;

export type StockStatus = "available" | "low" | "soldOut";

// Tickets still available: the contract counts paid (sold) and organizer-issued tickets
export function ticketsRemaining(type: { maxSupply: number; sold: number; issued: number }): number {
  return Math.max(0, type.maxSupply - type.sold - type.issued);
}

export function getStockStatus(remaining: number, supply: number): StockStatus {
  if (remaining <= 0) return "soldOut";
  if (supply > 0 && remaining / supply <= LOW_STOCK_RATIO) return "low";
  return "available";
}

// Share of all tickets still available, as a percentage with one decimal (17.6)
export function percentRemaining(remaining: number, supply: number): number {
  if (supply <= 0) return 0;
  return Math.round((remaining / supply) * 1000) / 10;
}
