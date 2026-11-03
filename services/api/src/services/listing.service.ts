import { EventStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Active resale listings for the Marketplace (#315). The listener keeps the Listing table in line
// with the contract (#299); the contract can't list its own listings, so the page reads them here.
// Buying still goes through the contract, which checks the listing again.

export const LISTING_SORTS = ['price_asc', 'price_desc', 'newest', 'event_date'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export interface ListingQuery {
  q?: string; // event title or seller wallet
  eventId?: string;
  category?: string;
  seller?: string; // one wallet's listings, for "Your listings"
  sort: ListingSort;
  page: number;
  limit: number;
}

const ORDER: Record<ListingSort, Prisma.ListingOrderByWithRelationInput[]> = {
  price_asc: [{ price: 'asc' }, { listed_at: 'desc' }, { token_id: 'asc' }],
  price_desc: [{ price: 'desc' }, { listed_at: 'desc' }, { token_id: 'asc' }],
  newest: [{ listed_at: 'desc' }, { token_id: 'asc' }],
  event_date: [{ ticket: { event: { start_date: 'asc' } } }, { price: 'asc' }, { token_id: 'asc' }],
};

const BPS = 10_000;

export async function listListings(query: ListingQuery, now: Date = new Date()) {
  const q = query.q?.trim();
  const eventFilter: Prisma.EventWhereInput = {
    status: EventStatus.PUBLISHED,
    ...(query.eventId ? { id: query.eventId } : {}),
    ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
  };

  const where: Prisma.ListingWhereInput = {
    ticket: { event: eventFilter },
    ...(query.seller ? { seller_wallet: query.seller.toLowerCase() } : {}),
    ...(q
      ? {
          OR: [
            { ticket: { event: { title: { contains: q, mode: 'insensitive' } } } },
            { seller_wallet: { contains: q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: ORDER[query.sort],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { ticket: { include: { ticket_type: true, event: true } } },
    }),
    prisma.listing.count({ where }),
  ]);

  const listings = rows.map(({ ticket, ...listing }) => {
    const { event, ticket_type: type } = ticket;
    const faceValue = ticket.face_value ?? type.price;
    const used = ticket.status === 'USED';
    const ended = event.sales_end_at !== null && event.sales_end_at <= now;
    const capBps = event.resale_cap_bps ?? 0;
    // Same rule as the contract's resaleCapApplies(): used tickets and tickets after the event are
    // collectibles with no cap, and an event can have no cap at all
    const capApplies = !used && !ended && capBps > 0;

    return {
      token_id: listing.token_id,
      seller_wallet: listing.seller_wallet,
      price: listing.price,
      listed_at: listing.listed_at,
      used,
      collectible: used || ended,
      max_price: capApplies ? faceValue.mul(capBps).div(BPS) : null,
      ticket_type: {
        id: type.id,
        name: type.name,
        contract_type_id: type.contract_type_id,
        face_value: faceValue,
      },
      event: {
        id: event.id,
        title: event.title,
        start_date: event.start_date,
        end_date: event.end_date,
        location: event.location,
        category: event.category,
        image_url: event.image_url,
        contract_event_id: event.contract_event_id,
        resale_cap_bps: event.resale_cap_bps,
        royalty_bps: event.royalty_bps,
        per_wallet_limit: event.per_wallet_limit,
        sales_end_at: event.sales_end_at,
      },
    };
  });

  return { listings, total, page: query.page, limit: query.limit };
}
