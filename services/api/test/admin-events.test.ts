import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { EventStatus, Prisma, User } from '@prisma/client';

import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, createTicketType } from './helpers/db';
import { authCookie } from './helpers/auth';

// GET /api/admin/events: the admin's Events tab (#297)

let created = 0;

// One second apart, so "newest first" has a clear order
function createEvent(organizerWallet: string, data: Partial<Prisma.EventUncheckedCreateInput> = {}) {
  return prisma.event.create({
    data: {
      organizer_wallet: organizerWallet,
      title: 'Test Event',
      start_date: new Date('2030-01-01T20:00:00Z'),
      status: EventStatus.DRAFT,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, created++)),
      ...data,
    },
  });
}

function titles(res: request.Response): string[] {
  return res.body.events.map((event: { title: string }) => event.title);
}

describe('GET /api/admin/events', () => {
  let adminCookie: string;
  let sophie: User;
  let david: User;

  const list = (query = '') => request(app).get(`/api/admin/events${query}`).set('Cookie', adminCookie);

  beforeEach(async () => {
    await resetDb();
    const admin = await createUser({ role: 'ADMIN' });
    adminCookie = authCookie(admin.wallet_address, 'ADMIN');

    sophie = await createUser({ role: 'ORGANIZER' });
    await prisma.user.update({
      where: { wallet_address: sophie.wallet_address },
      data: { first_name: 'Sophie', last_name: 'Martin' },
    });
    david = await createUser({ role: 'ORGANIZER' });
    await prisma.user.update({ where: { wallet_address: david.wallet_address }, data: { nickname: 'dkalu' } });
    await prisma.organizerRequest.create({
      data: {
        wallet: david.wallet_address,
        status: 'APPROVED',
        reviewed_at: new Date('2026-10-01T12:00:00Z'),
        organization_name: 'Kalu Live',
      },
    });
  });

  it('requires a session', async () => {
    const res = await request(app).get('/api/admin/events');
    expect(res.status).toBe(401);
  });

  it('rejects a regular user and an organizer', async () => {
    const user = await createUser({ role: 'USER' });
    const asUser = await request(app).get('/api/admin/events').set('Cookie', authCookie(user.wallet_address, 'USER'));
    expect(asUser.status).toBe(403);
    expect(asUser.body.events).toBeUndefined();

    const asOrganizer = await request(app)
      .get('/api/admin/events')
      .set('Cookie', authCookie(sophie.wallet_address, 'ORGANIZER'));
    expect(asOrganizer.status).toBe(403);
  });

  it('returns every event in every status, newest first, with its organizer, sales and settings', async () => {
    const draft = await createEvent(sophie.wallet_address, { title: 'Draft night' });
    await createEvent(sophie.wallet_address, { title: 'Frozen night', status: EventStatus.FROZEN });
    const live = await createEvent(david.wallet_address, {
      title: 'Midnight Run',
      location: 'Bell Centre, Montreal',
      status: EventStatus.PUBLISHED,
      contract_event_id: BigInt(7),
      sale_active: true,
      presale_active: true,
      royalty_bps: 1000,
      resale_cap_bps: 20000,
      per_wallet_limit: 4,
      sales_end_at: new Date('2029-12-31T20:00:00Z'),
    });
    await createTicketType(live.id, { name: 'General', supply: 1000 });
    await createTicketType(live.id, { name: 'VIP', supply: 450 });
    await prisma.ticketType.updateMany({ where: { event_id: live.id, name: 'General' }, data: { sold: 995 } });
    await prisma.ticketType.updateMany({ where: { event_id: live.id, name: 'VIP' }, data: { sold: 200 } });

    const res = await list();

    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Midnight Run', 'Frozen night', 'Draft night']);
    expect(res.body).toMatchObject({ total: 3, page: 1, limit: 20 });

    expect(res.body.events[0]).toEqual({
      id: live.id,
      title: 'Midnight Run',
      location: 'Bell Centre, Montreal',
      status: 'PUBLISHED',
      sale_active: true,
      presale_active: true,
      contract_event_id: '7',
      start_date: '2030-01-01T20:00:00.000Z',
      end_date: null,
      organizer: {
        wallet: david.wallet_address,
        first_name: null,
        last_name: null,
        nickname: 'dkalu',
        organization_name: 'Kalu Live',
      },
      sold: 1195,
      supply: 1450,
      royalty_bps: 1000,
      resale_cap_bps: 20000,
      per_wallet_limit: 4,
      sales_end_at: '2029-12-31T20:00:00.000Z',
    });

    // A draft has no ticket types on-chain and no settings yet
    expect(res.body.events[2]).toMatchObject({
      id: draft.id,
      status: 'DRAFT',
      contract_event_id: null,
      organizer: { wallet: sophie.wallet_address, first_name: 'Sophie', last_name: 'Martin', organization_name: null },
      sold: 0,
      supply: 0,
      royalty_bps: null,
      resale_cap_bps: null,
      per_wallet_limit: null,
      sales_end_at: null,
    });
  });

  it('does not expose the organizer email', async () => {
    await createEvent(sophie.wallet_address);
    const res = await list();
    expect(JSON.stringify(res.body)).not.toContain(sophie.email);
  });

  it('searches the event title and the organizer name, organization and wallet', async () => {
    await createEvent(sophie.wallet_address, { title: 'Winter Gala' });
    await createEvent(sophie.wallet_address, { title: 'Jazz at the Atrium' });
    await createEvent(david.wallet_address, { title: 'Midnight Run' });

    expect(titles(await list('?q=gala'))).toEqual(['Winter Gala']);
    expect(titles(await list('?q=MARTIN')).sort()).toEqual(['Jazz at the Atrium', 'Winter Gala']);
    // Full name: neither column holds "sophie martin" on its own
    expect(titles(await list('?q=sophie%20martin')).sort()).toEqual(['Jazz at the Atrium', 'Winter Gala']);
    // An event word and an organizer word together
    expect(titles(await list('?q=jazz%20sophie'))).toEqual(['Jazz at the Atrium']);
    expect(titles(await list('?q=dkalu'))).toEqual(['Midnight Run']);
    expect(titles(await list('?q=kalu%20live'))).toEqual(['Midnight Run']);
    expect(titles(await list(`?q=${david.wallet_address.slice(0, 12).toUpperCase()}`))).toEqual(['Midnight Run']);

    const none = await list('?q=nothing-like-this');
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ events: [], total: 0 });

    // Empty or blank means no search
    expect((await list('?q=')).body.total).toBe(3);
    expect((await list('?q=%20%20')).body.total).toBe(3);
  });

  it('does not search a rejected or pending request’s organization name', async () => {
    await prisma.organizerRequest.create({
      data: { wallet: sophie.wallet_address, status: 'REJECTED', organization_name: 'Old Name Inc' },
    });
    await createEvent(sophie.wallet_address, { title: 'Winter Gala' });

    expect((await list('?q=old%20name')).body.total).toBe(0);
  });

  it('treats % and _ in the search as plain characters', async () => {
    await createEvent(sophie.wallet_address, { title: '50% off night' });
    await createEvent(sophie.wallet_address, { title: 'rock_n_roll' });
    await createEvent(sophie.wallet_address, { title: 'rockXnXroll' });

    expect(titles(await list('?q=%25'))).toEqual(['50% off night']);
    expect(titles(await list('?q=rock_n'))).toEqual(['rock_n_roll']);
  });

  it('filters live and not-live events, together with the search', async () => {
    await createEvent(sophie.wallet_address, { title: 'Draft night' });
    await createEvent(sophie.wallet_address, { title: 'Frozen night', status: EventStatus.FROZEN });
    await createEvent(sophie.wallet_address, { title: 'Live night', status: EventStatus.PUBLISHED, contract_event_id: BigInt(1) });
    await createEvent(david.wallet_address, { title: 'Live run', status: EventStatus.PUBLISHED, contract_event_id: BigInt(2) });

    expect(titles(await list('?live=true')).sort()).toEqual(['Live night', 'Live run']);
    expect(titles(await list('?live=false')).sort()).toEqual(['Draft night', 'Frozen night']);
    const both = await list('?live=true&q=night');
    expect(titles(both)).toEqual(['Live night']);
    expect(both.body.total).toBe(1);
  });

  it('paginates, and the total counts every match', async () => {
    for (let i = 1; i <= 5; i++) await createEvent(sophie.wallet_address, { title: `Night ${i}` });
    await createEvent(david.wallet_address, { title: 'Midnight Run' });

    const first = await list('?q=night&limit=2');
    expect(titles(first)).toEqual(['Midnight Run', 'Night 5']);
    expect(first.body).toMatchObject({ total: 6, page: 1, limit: 2 });

    const third = await list('?q=night&limit=2&page=3');
    expect(titles(third)).toEqual(['Night 2', 'Night 1']);

    const past = await list('?q=night&limit=2&page=4');
    expect(past.body).toMatchObject({ events: [], total: 6, page: 4 });

    // Out-of-range values fall back to the limits
    expect((await list('?limit=500')).body.limit).toBe(50);
    expect((await list('?limit=0&page=-3')).body).toMatchObject({ limit: 20, page: 1 });
  });

  it('rejects a repeated or too long search and an unknown live value', async () => {
    expect((await list('?q=a&q=b')).status).toBe(400);
    expect((await list(`?q=${'a'.repeat(101)}`)).status).toBe(400);
    expect((await list(`?q=${'a'.repeat(100)}`)).status).toBe(200);
    expect((await list('?live=yes')).status).toBe(400);
    expect((await list('?live=true&live=false')).status).toBe(400);
  });
});
