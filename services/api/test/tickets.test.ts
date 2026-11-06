import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { ethers } from 'ethers';
import { Event, TicketType } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, createEvent, createTicketType, randomWallet } from './helpers/db';
import { authCookie } from './helpers/auth';

// GET /api/tickets/owner/:address (#219): the tickets a wallet holds, for My Tickets
describe('GET /api/tickets/owner/:address', () => {
  let event: Event;
  let type: TicketType;
  let owner: string;
  let tokenCounter = 0n;

  async function ticket(data: { owner?: string; status?: 'VALID' | 'USED'; used_at?: Date; minted_at?: Date; purchase_price?: string } = {}) {
    const tokenId = ++tokenCounter;
    await prisma.ticket.create({
      data: {
        token_id: tokenId,
        event_id: event.id,
        ticket_type_id: type.id,
        owner_wallet: data.owner ?? owner,
        status: data.status ?? 'VALID',
        used_at: data.used_at,
        minted_at: data.minted_at,
        face_value: data.purchase_price ?? '15',
        purchase_price: data.purchase_price,
      },
    });
    return tokenId;
  }

  const get = (address: string) => request(app).get(`/api/tickets/owner/${address}`);

  beforeEach(async () => {
    await resetDb();
    tokenCounter = 0n;
    const organizer = await createUser({ role: 'ORGANIZER' });
    event = await createEvent(organizer.wallet_address, {
      title: 'Gala Opera Concert',
      status: 'PUBLISHED',
      contract_event_id: 281474976710655n, // a 48-bit contract event ID (#312)
    });
    type = await createTicketType(event.id, { name: 'General Admission', contract_type_id: 0 });
    owner = randomWallet();
  });

  it("returns the wallet's tickets with their event and ticket type, without signing in", async () => {
    const tokenId = await ticket({ purchase_price: '15.5' });

    const res = await get(owner);
    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0]).toMatchObject({
      token_id: tokenId.toString(),
      owner_wallet: owner,
      status: 'VALID',
      used_at: null,
      purchase_price: '15.5',
      listing_price: null,
      event: { id: event.id, contract_event_id: '281474976710655', title: 'Gala Opera Concert' },
      ticket_type: { id: type.id, name: 'General Admission', contract_type_id: 0 },
    });
  });

  it('accepts the address in any case', async () => {
    await ticket();
    const res = await get(ethers.getAddress(owner));
    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
  });

  it("leaves out other wallets' tickets", async () => {
    await ticket();
    await ticket({ owner: randomWallet() });

    const res = await get(owner);
    expect(res.body.tickets.map((t: { owner_wallet: string }) => t.owner_wallet)).toEqual([owner]);
  });

  it('includes used tickets with when they were checked in, and the resale price of listed ones', async () => {
    const usedAt = new Date('2026-10-10T20:00:00Z');
    const used = await ticket({ status: 'USED', used_at: usedAt, minted_at: new Date('2026-10-01T00:00:00Z') });
    const listed = await ticket({ minted_at: new Date('2026-10-02T00:00:00Z') });
    await prisma.listing.create({ data: { token_id: listed, seller_wallet: owner, price: '22', listed_at: new Date() } });

    const res = await get(owner);
    // Newest first
    expect(res.body.tickets.map((t: { token_id: string }) => t.token_id)).toEqual([listed.toString(), used.toString()]);
    expect(res.body.tickets[0].listing_price).toBe('22');
    expect(res.body.tickets[1]).toMatchObject({ status: 'USED', used_at: usedAt.toISOString() });
  });

  it('returns an empty list for a wallet with no tickets', async () => {
    const res = await get(randomWallet());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tickets: [] });
  });

  it.each(['not-a-wallet', '0x1234', '123'])('rejects %s as an address', async (address) => {
    const res = await get(address);
    expect(res.status).toBe(400);
  });

  it('still serves single tickets by token ID', async () => {
    const tokenId = await ticket();
    const res = await request(app).get(`/api/tickets/${tokenId}`);
    expect(res.status).toBe(200);
    expect(res.body.token_id).toBe(tokenId.toString());
  });
});

// #118: ticket validity comes from the contract, so the API has no validate route
describe('GET /api/tickets/:tokenId/validate', () => {
  it('no longer exists', async () => {
    const scanner = await createUser({ role: 'SCANNER' });
    const res = await request(app)
      .get('/api/tickets/1/validate')
      .query({ eventId: 'any' })
      .set('Cookie', authCookie(scanner.wallet_address, 'SCANNER'));
    expect(res.status).toBe(404);
  });
});
