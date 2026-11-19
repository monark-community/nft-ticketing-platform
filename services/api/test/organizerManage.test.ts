import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Event, TicketType, User } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, createEvent, createTicketType, randomWallet } from './helpers/db';
import { authCookie } from './helpers/auth';

// The organizer manage page's API (#190): every ticket of an event with its current owner, and
// the whitelist batch limit that matches the contract's batchAddToWhitelist() (#191).

let organizer: User;
let cookie: string;
let event: Event;
let ga: TicketType;
let vip: TicketType;

function getTickets(query: Record<string, string | number> = {}) {
  return request(app).get(`/api/events/${event.id}/tickets`).set('Cookie', cookie).query(query);
}

async function createTicket(
  tokenId: number,
  type: TicketType,
  data: {
    owner_wallet?: string;
    status?: 'VALID' | 'USED';
    used_at?: Date | null;
    purchase_price?: number | null;
    face_value?: number | null;
    listing_price?: number | null;
    minted_at?: Date;
  } = {}
) {
  const ticket = await prisma.ticket.create({
    data: {
      token_id: BigInt(tokenId),
      event_id: event.id,
      ticket_type_id: type.id,
      owner_wallet: data.owner_wallet ?? randomWallet(),
      status: data.status ?? 'VALID',
      used_at: data.used_at ?? null,
      purchase_price: data.purchase_price === undefined ? 25 : data.purchase_price,
      face_value: data.face_value === undefined ? (data.purchase_price === undefined ? 25 : data.purchase_price) : data.face_value,
      minted_at: data.minted_at ?? new Date(),
    },
  });
  if (data.listing_price != null) {
    await prisma.listing.create({
      data: { token_id: ticket.token_id, seller_wallet: ticket.owner_wallet, price: data.listing_price, listed_at: new Date() },
    });
  }
  return ticket;
}

beforeEach(async () => {
  await resetDb();
  organizer = await createUser({ role: 'ORGANIZER' });
  cookie = authCookie(organizer.wallet_address, 'ORGANIZER');
  event = await createEvent(organizer.wallet_address, { status: 'PUBLISHED', contract_event_id: 42n });
  ga = await createTicketType(event.id, { name: 'General Admission', price: 25 });
  vip = await createTicketType(event.id, { name: 'VIP', price: 80, contract_type_id: 1 });
});

describe('GET /api/events/:id/tickets', () => {
  it('requires an organizer account', async () => {
    expect((await request(app).get(`/api/events/${event.id}/tickets`)).status).toBe(401);

    const attendee = await createUser({ role: 'USER' });
    const res = await request(app)
      .get(`/api/events/${event.id}/tickets`)
      .set('Cookie', authCookie(attendee.wallet_address, 'USER'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown event, 403 for another organizer and 409 before publishing', async () => {
    const missing = await request(app)
      .get('/api/events/00000000-0000-0000-0000-000000000000/tickets')
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);

    const other = await createUser({ role: 'ORGANIZER' });
    const forbidden = await request(app)
      .get(`/api/events/${event.id}/tickets`)
      .set('Cookie', authCookie(other.wallet_address, 'ORGANIZER'));
    expect(forbidden.status).toBe(403);

    const draft = await createEvent(organizer.wallet_address, { status: 'DRAFT' });
    const unpublished = await request(app).get(`/api/events/${draft.id}/tickets`).set('Cookie', cookie);
    expect(unpublished.status).toBe(409);
  });

  it('lists sold and issued tickets with their current owner, status and prices', async () => {
    const alice = randomWallet();
    const bob = randomWallet();
    const carol = randomWallet();
    const dave = randomWallet();
    const listedAt = new Date('2030-01-04T12:00:00Z');

    await createTicket(1, ga, { owner_wallet: alice, purchase_price: 25, minted_at: new Date('2030-01-01T12:00:00Z') });
    await createTicket(2, ga, {
      owner_wallet: bob,
      purchase_price: 25,
      status: 'USED',
      used_at: new Date('2030-02-01T20:00:00Z'),
      minted_at: new Date('2030-01-02T12:00:00Z'),
    });
    await createTicket(3, vip, {
      owner_wallet: carol,
      purchase_price: null,
      face_value: 0,
      minted_at: new Date('2030-01-03T12:00:00Z'),
    });
    await createTicket(4, vip, {
      owner_wallet: dave,
      purchase_price: null,
      face_value: 80,
      status: 'USED',
      used_at: new Date('2030-02-01T21:00:00Z'),
      listing_price: 60,
      minted_at: listedAt,
    });

    const res = await getTickets();
    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ total: 4, sold: 2, issued: 2, valid: 2, used: 2 });
    expect(res.body).toMatchObject({ total: 4, page: 1, limit: 20 });
    expect(res.body.tickets.map((t: { token_id: string }) => t.token_id)).toEqual(['4', '3', '2', '1']);

    expect(res.body.tickets[0]).toMatchObject({
      token_id: '4',
      owner_wallet: dave,
      status: 'USED',
      purchase_price: null,
      face_value: '80',
      listing_price: '60',
      kind: 'issued',
      ticket_type: { id: vip.id, name: 'VIP', contract_type_id: 1 },
    });
    expect(res.body.tickets[0].used_at).toBe(new Date('2030-02-01T21:00:00Z').toISOString());

    expect(res.body.tickets[1]).toMatchObject({ token_id: '3', owner_wallet: carol, kind: 'issued', status: 'VALID' });
    expect(res.body.tickets[2]).toMatchObject({ token_id: '2', owner_wallet: bob, kind: 'sale', status: 'USED' });
    expect(res.body.tickets[3]).toMatchObject({ token_id: '1', owner_wallet: alice, kind: 'sale', purchase_price: '25' });
  });

  it('filters by status, kind and ticket type, and pages the filtered list', async () => {
    await createTicket(1, ga, { purchase_price: 25 });
    await createTicket(2, ga, { purchase_price: 25, status: 'USED', used_at: new Date() });
    await createTicket(3, vip, { purchase_price: null });
    await createTicket(4, vip, { purchase_price: null, status: 'USED', used_at: new Date() });

    expect((await getTickets({ status: 'USED' })).body.tickets).toHaveLength(2);
    expect((await getTickets({ kind: 'issued' })).body.tickets).toHaveLength(2);
    expect((await getTickets({ ticket_type_id: ga.id })).body.tickets).toHaveLength(2);

    const usedIssued = await getTickets({ status: 'USED', kind: 'issued' });
    expect(usedIssued.body.tickets.map((t: { token_id: string }) => t.token_id)).toEqual(['4']);

    const second = await getTickets({ limit: 2, page: 2 });
    expect(second.body).toMatchObject({ total: 4, page: 2, limit: 2 });
    expect(second.body.tickets).toHaveLength(2);

    const empty = await getTickets({ status: 'USED', kind: 'sale', ticket_type_id: vip.id });
    expect(empty.body).toMatchObject({ tickets: [], total: 0 });
  });

  it('rejects unknown filters and caps the page size', async () => {
    expect((await getTickets({ status: 'LOST' })).status).toBe(400);
    expect((await getTickets({ kind: 'free' })).status).toBe(400);
    expect((await getTickets({ limit: 500 })).body.limit).toBe(100);
  });
});

describe('POST /api/events/:id/whitelist batch limit', () => {
  it('rejects more than 100 wallets, like the contract', async () => {
    const res = await request(app)
      .post(`/api/events/${event.id}/whitelist`)
      .set('Cookie', cookie)
      .send({ wallets: Array.from({ length: 101 }, randomWallet) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/);
  });
});
