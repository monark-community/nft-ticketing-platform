import { ethers } from 'ethers';

// Shared request checks so bad input gets a 400 instead of failing in Prisma with a 500

const MAX_PRICE = 1e10; // TicketType.price is Decimal(18, 8)
const MAX_SUPPLY = 2147483647; // TicketType.supply is a Postgres INTEGER

export function isWalletAddress(value: unknown): value is string {
  return typeof value === 'string' && ethers.isAddress(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isDateString(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

// Accepts a number or a numeric string, since prices are decimals
function isPrice(value: unknown): boolean {
  const n = typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < MAX_PRICE;
}

function isSupply(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SUPPLY;
}

// Returns an error message, or null if the input is fine. With partial, fields
// that are left out aren't checked (used for updates).
export function validateEventInput(body: Record<string, unknown>, { partial }: { partial: boolean }): string | null {
  const { title, description, location, category, start_date, end_date, image_url } = body;

  if (!partial || title !== undefined) {
    if (!isNonEmptyString(title)) return 'title must be a non-empty string';
  }
  if (!partial || start_date !== undefined) {
    if (!isDateString(start_date)) return 'start_date must be a valid date';
  }
  if (end_date !== undefined && end_date !== null && !isDateString(end_date)) {
    return 'end_date must be a valid date';
  }
  for (const [field, value] of Object.entries({ description, location, category, image_url })) {
    if (!isOptionalString(value)) return `${field} must be a string`;
  }
  return null;
}

export function validateTicketTypeInput(body: Record<string, unknown>, { partial }: { partial: boolean }): string | null {
  const { name, description, price, supply } = body;

  if (!partial || name !== undefined) {
    if (!isNonEmptyString(name)) return 'name must be a non-empty string';
  }
  if (!isOptionalString(description)) return 'description must be a string';
  if (!partial || price !== undefined) {
    if (!isPrice(price)) return 'price must be a number that is 0 or more';
  }
  if (!partial || supply !== undefined) {
    if (!isSupply(supply)) return 'supply must be a whole number that is 1 or more';
  }
  return null;
}
