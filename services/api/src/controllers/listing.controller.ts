import { Request, Response } from 'express';
import { LISTING_SORTS, ListingSort, listListings } from '../services/listing.service';
import { isWalletAddress } from '../lib/validation';
import logger from '../lib/logger';

const MAX_LIMIT = 50;

// A whole number from the query string, or null when it isn't one
function positiveInt(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 ? n : null;
}

// Optional text filter: absent is fine, but a repeated parameter (?q=a&q=b) arrives as an array
function optionalString(value: unknown): { ok: boolean; value?: string } {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  return { ok: true, value: trimmed === '' ? undefined : trimmed };
}

// GET /api/listings (#315): active resale listings with their ticket and event
export async function getListings(req: Request, res: Response): Promise<void> {
  const { page, limit, sort } = req.query;

  const pageNumber = page === undefined ? 1 : positiveInt(page);
  if (pageNumber === null) {
    res.status(400).json({ error: 'page must be a whole number of 1 or more' });
    return;
  }
  const limitNumber = limit === undefined ? 20 : positiveInt(limit);
  if (limitNumber === null || limitNumber > MAX_LIMIT) {
    res.status(400).json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}` });
    return;
  }
  if (sort !== undefined && !LISTING_SORTS.includes(sort as ListingSort)) {
    res.status(400).json({ error: `sort must be one of: ${LISTING_SORTS.join(', ')}` });
    return;
  }

  const filters: Record<string, string | undefined> = {};
  for (const name of ['q', 'event_id', 'category', 'seller'] as const) {
    const parsed = optionalString(req.query[name]);
    if (!parsed.ok) {
      res.status(400).json({ error: `${name} must be a single value` });
      return;
    }
    filters[name] = parsed.value;
  }
  if (filters.seller !== undefined && !isWalletAddress(filters.seller)) {
    res.status(400).json({ error: 'seller must be a wallet address' });
    return;
  }

  try {
    const result = await listListings({
      q: filters.q,
      eventId: filters.event_id,
      category: filters.category,
      seller: filters.seller,
      sort: (sort as ListingSort | undefined) ?? 'price_asc',
      page: pageNumber,
      limit: limitNumber,
    });
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch listings', { error: err });
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
}
