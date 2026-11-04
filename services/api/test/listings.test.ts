import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Event, TicketType } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, createEvent, createTicketType, randomWallet } from './helpers/db';

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);

let tokenCounter = 0n;

// A ticket of the given type, listed for resale by its owner
async function listTicket(
  event: Event,
  type: TicketType,
  options: { price: string; seller?: string; used?: boolean; listedAt?: Date; faceValue?: string }
) {
  const tokenId = ++tokenCounter;
  const seller = options.seller ?? randomWallet();
  await prisma.ticket.create({
    data: {
      token_id: tokenId,
      event_id: event.id,
      ticket_type_id: type.id,
      owner_wallet: seller,
      status: options.used ? 'USED' : 'VALID',
      face_value: options.faceValue ?? type.price,
    },
  });
  await prisma.listing.create({
    data: { token_id: tokenId, seller_wallet: seller, price: options.price, listed_at: options.listedAt ?? new Date() },
  });
  return tokenId;
}

const get = (query = '') => request(app).get(`/api/listings${query}`);
const tokenIds = (res: request.Response) => res.body.listings.map((l: { token_id: string }) => l.token_id);

let gala: Event;
let jazz: Event;
let galaGA: TicketType;
let galaVip: TicketType;
let jazzGA: TicketType;

beforeEach(async () => {
  await resetDb();
  tokenCounter = 0n;
  const organizer = await createUser({ role: 'ORGANIZER' });

  gala = await createEvent(organizer.wallet_address, {
    title: 'Gala Opera Concert',
    category: 'Classical & Opera',
    status: 'PUBLISHED',
    contract_event_id: 1n,
    start_date: inDays(30),
    resale_cap_bps: 20000,
    royalty_bps: 1000,
    sales_end_at: inDays(30),
  });
  jazz = await createEvent(organizer.wallet_address, {
    title: 'Jazz at the Atrium',
    category: 'Concerts',
    status: 'PUBLISHED',
    contract_event_id: 2n,
    start_date: inDays(10),
    resale_cap_bps: 15000,
    royalty_bps: 500,
    sales_end_at: inDays(10),
  });
  galaGA = await createTicketType(gala.id, { name: 'General Admission', price: 15, contract_type_id: 0 });
  galaVip = await createTicketType(gala.id, { name: 'VIP', price: 28, contract_type_id: 1 });
  jazzGA = await createTicketType(jazz.id, { name: 'General Admission', price: 20, contract_type_id: 0 });
});

describe('GET /api/listings', () => {
  it('is public and returns each listing with its ticket type and event (#315)', async () => {
    const seller = randomWallet();
    await listTicket(gala, galaGA, { price: '22', seller });

    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(res.body.listings[0]).toMatchObject({
      token_id: '1',
      seller_wallet: seller,
      price: '22',
      used: false,
      collectible: false,
      max_price: '30',
      ticket_type: { id: galaGA.id, name: 'General Admission', contract_type_id: 0, face_value: '15' },
      event: {
        id: gala.id,
        title: 'Gala Opera Concert',
        category: 'Classical & Opera',
        contract_event_id: '1',
        resale_cap_bps: 20000,
        royalty_bps: 1000,
      },
    });
    expect(res.body.listings[0].listed_at).toBeTruthy();
    expect(res.body.listings[0].event.start_date).toBeTruthy();
  });

  it('only returns active listings', async () => {
    const kept = await listTicket(gala, galaGA, { price: '22' });
    const cancelled = await listTicket(gala, galaGA, { price: '20' });
    const resold = await listTicket(gala, galaVip, { price: '40' });

    // What the listener does for ListingCancelled and TicketResold
    await prisma.listing.delete({ where: { token_id: cancelled } });
    await prisma.listing.delete({ where: { token_id: resold } });

    const res = await get();
    expect(tokenIds(res)).toEqual([kept.toString()]);
    expect(res.body.total).toBe(1);
  });

  it('treats used tickets and tickets after the event as collectibles with no price cap', async () => {
    await listTicket(gala, galaGA, { price: '99', used: true });
    const past = await createEvent(gala.organizer_wallet, {
      title: 'Autumn Strings',
      status: 'PUBLISHED',
      contract_event_id: 3n,
      start_date: inDays(-3),
      resale_cap_bps: 20000,
      sales_end_at: inDays(-3),
    });
    await listTicket(past, await createTicketType(past.id, { contract_type_id: 0 }), { price: '80' });

    const res = await get();
    for (const listing of res.body.listings) {
      expect(listing).toMatchObject({ collectible: true, max_price: null });
    }
    expect(res.body.listings.find((l: { used: boolean }) => l.used)).toBeTruthy();
  });

  it('has no price cap when the event has none', async () => {
    await prisma.event.update({ where: { id: gala.id }, data: { resale_cap_bps: 0 } });
    await listTicket(gala, galaGA, { price: '22' });

    const res = await get();
    expect(res.body.listings[0]).toMatchObject({ collectible: false, max_price: null });
  });

  it('bases the cap on the ticket face value', async () => {
    await listTicket(gala, galaGA, { price: '22', faceValue: '12.5' });
    expect((await get()).body.listings[0].max_price).toBe('25');
  });

  it('leaves out listings of events that are not published', async () => {
    const frozen = await createEvent(gala.organizer_wallet, { status: 'FROZEN' });
    await listTicket(frozen, await createTicketType(frozen.id), { price: '10' });
    expect((await get()).body.total).toBe(0);
  });

  describe('filters', () => {
    let galaSeller: string;
    let jazzSeller: string;

    beforeEach(async () => {
      galaSeller = randomWallet();
      jazzSeller = randomWallet();
      await listTicket(gala, galaGA, { price: '22', seller: galaSeller });
      await listTicket(jazz, jazzGA, { price: '25', seller: jazzSeller });
    });

    it('q searches event titles, ignoring case', async () => {
      expect(tokenIds(await get('?q=gala'))).toEqual(['1']);
      expect(tokenIds(await get('?q=ATRIUM'))).toEqual(['2']);
    });

    it('q also finds a seller wallet, or part of it', async () => {
      expect(tokenIds(await get(`?q=${jazzSeller.toUpperCase()}`))).toEqual(['2']);
      expect(tokenIds(await get(`?q=${galaSeller.slice(0, 10)}`))).toEqual(['1']);
    });

    it('event_id keeps one event', async () => {
      expect(tokenIds(await get(`?event_id=${jazz.id}`))).toEqual(['2']);
      expect((await get('?event_id=unknown')).body.total).toBe(0);
    });

    it('category keeps one category, ignoring case', async () => {
      expect(tokenIds(await get('?category=classical%20%26%20opera'))).toEqual(['1']);
    });

    it("seller keeps one wallet's listings", async () => {
      expect(tokenIds(await get(`?seller=${jazzSeller}`))).toEqual(['2']);
    });

    it('combines filters', async () => {
      expect((await get(`?category=Concerts&q=gala`)).body.total).toBe(0);
    });
  });

  describe('sort', () => {
    beforeEach(async () => {
      await listTicket(gala, galaGA, { price: '22', listedAt: new Date('2026-10-01T00:00:00Z') }); // 1
      await listTicket(gala, galaVip, { price: '40', listedAt: new Date('2026-10-03T00:00:00Z') }); // 2
      await listTicket(jazz, jazzGA, { price: '25', listedAt: new Date('2026-10-02T00:00:00Z') }); // 3
    });

    it('defaults to the lowest price first', async () => {
      expect(tokenIds(await get())).toEqual(['1', '3', '2']);
      expect(tokenIds(await get('?sort=price_asc'))).toEqual(['1', '3', '2']);
    });

    it('price_desc puts the highest price first', async () => {
      expect(tokenIds(await get('?sort=price_desc'))).toEqual(['2', '3', '1']);
    });

    it('newest puts the latest listing first', async () => {
      expect(tokenIds(await get('?sort=newest'))).toEqual(['2', '3', '1']);
    });

    it('event_date puts the soonest event first', async () => {
      expect(tokenIds(await get('?sort=event_date'))).toEqual(['3', '1', '2']);
    });
  });

  it('paginates and returns the total', async () => {
    for (const price of ['10', '11', '12', '13', '14']) await listTicket(gala, galaGA, { price });

    const first = await get('?limit=2');
    expect(first.body).toMatchObject({ total: 5, page: 1, limit: 2 });
    expect(tokenIds(first)).toEqual(['1', '2']);

    const last = await get('?limit=2&page=3');
    expect(tokenIds(last)).toEqual(['5']);
  });

  it.each([
    ['?sort=cheapest', 'sort'],
    ['?page=0', 'page'],
    ['?page=abc', 'page'],
    ['?limit=0', 'limit'],
    ['?limit=51', 'limit'],
    ['?limit=1.5', 'limit'],
    ['?q=a&q=b', 'q'],
    ['?category=a&category=b', 'category'],
    ['?seller=not-a-wallet', 'seller'],
  ])('returns 400 for %s', async (query, field) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(field);
  });
});
