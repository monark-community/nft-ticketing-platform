import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { User } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { pinImageToIPFS, pinMetadataToIPFS } from '../src/services/ipfs.service';
import { resetDb, createUser, createEvent, createTicketType } from './helpers/db';
import { authCookie } from './helpers/auth';

// Pinning is covered in ipfs.test.ts; here it just needs to succeed
vi.mock('../src/services/ipfs.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/ipfs.service')>()),
  pinImageToIPFS: vi.fn(async () => 'bafy-image'),
  pinMetadataToIPFS: vi.fn(async () => 'bafy-metadata'),
}));

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function freeze(eventId: string, cookie: string) {
  return request(app)
    .post(`/api/events/${eventId}/freeze`)
    .set('Cookie', cookie)
    .attach('image', png, { filename: 'poster.png', contentType: 'image/png' });
}

function publish(eventId: string, cookie: string, contract_event_id: number | string = 1) {
  return request(app).post(`/api/events/${eventId}/publish`).set('Cookie', cookie).send({ contract_event_id });
}

let organizer: User;
let cookie: string;

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  organizer = await createUser({ role: 'ORGANIZER' });
  cookie = authCookie(organizer.wallet_address, 'ORGANIZER');
});

describe('event status rules', () => {
  it('creates new events as DRAFT, owned by the caller', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', cookie)
      .send({ title: 'Launch Party', start_date: '2030-01-01T20:00:00Z' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.organizer_wallet).toBe(organizer.wallet_address);
  });

  it('goes DRAFT -> FROZEN -> PUBLISHED and only then shows up publicly', async () => {
    const event = await createEvent(organizer.wallet_address);
    await createTicketType(event.id);

    let list = await request(app).get('/api/events');
    expect(list.body.events).toHaveLength(0);

    const frozen = await freeze(event.id, cookie);
    expect(frozen.status).toBe(200);
    expect(frozen.body.event.status).toBe('FROZEN');
    expect(frozen.body.ipfs_hash).toBe('bafy-metadata');

    const published = await publish(event.id, cookie, 42);
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.contract_event_id).toBe('42');

    list = await request(app).get('/api/events');
    expect(list.body.events.map((e: { id: string }) => e.id)).toEqual([event.id]);
  });

  it('only lists PUBLISHED events', async () => {
    await createEvent(organizer.wallet_address, { status: 'DRAFT' });
    await createEvent(organizer.wallet_address, { status: 'FROZEN' });
    const published = await createEvent(organizer.wallet_address, { status: 'PUBLISHED', contract_event_id: 7n });

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.events[0].id).toBe(published.id);
  });

  it('leaves past events out of the list and the total', async () => {
    await createEvent(organizer.wallet_address, { status: 'PUBLISHED', contract_event_id: 8n, start_date: new Date('2020-01-01T20:00:00Z') });
    const upcoming = await createEvent(organizer.wallet_address, { status: 'PUBLISHED', contract_event_id: 9n });

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.events.map((e: { id: string }) => e.id)).toEqual([upcoming.id]);
  });

  it('lets a DRAFT be edited, but never its status, owner or IPFS hash', async () => {
    const event = await createEvent(organizer.wallet_address);
    const res = await request(app).put(`/api/events/${event.id}`).set('Cookie', cookie).send({
      title: 'Renamed',
      status: 'PUBLISHED',
      organizer_wallet: '0x000000000000000000000000000000000000dead',
      ipfs_hash: 'bafy-sneaky',
    });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.organizer_wallet).toBe(organizer.wallet_address);
    expect(res.body.ipfs_hash).toBeNull();
  });

  it.each(['FROZEN', 'PUBLISHED'] as const)('blocks edits once the event is %s', async (status) => {
    const event = await createEvent(organizer.wallet_address, {
      status,
      contract_event_id: status === 'PUBLISHED' ? 1n : undefined,
    });
    const res = await request(app).put(`/api/events/${event.id}`).set('Cookie', cookie).send({ title: 'Too late' });
    expect(res.status).toBe(409);
  });

  it('blocks adding or editing ticket types once the event is frozen', async () => {
    const event = await createEvent(organizer.wallet_address);
    const ticketType = await createTicketType(event.id);
    await prisma.event.update({ where: { id: event.id }, data: { status: 'FROZEN' } });

    const add = await request(app)
      .post(`/api/events/${event.id}/ticket-types`)
      .set('Cookie', cookie)
      .send({ name: 'VIP', price: 100, supply: 10 });
    expect(add.status).toBe(409);

    const edit = await request(app).put(`/api/ticket-types/${ticketType.id}`).set('Cookie', cookie).send({ supply: 5 });
    expect(edit.status).toBe(409);
  });

  it('never lets a ticket type edit change sold or event_id', async () => {
    const event = await createEvent(organizer.wallet_address);
    const other = await createEvent(organizer.wallet_address);
    const ticketType = await createTicketType(event.id);

    const res = await request(app)
      .put(`/api/ticket-types/${ticketType.id}`)
      .set('Cookie', cookie)
      .send({ name: 'Early Bird', sold: 99, event_id: other.id });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Early Bird');
    expect(res.body.sold).toBe(0);
    expect(res.body.event_id).toBe(event.id);
  });

  it('will not freeze an event twice, and does not pin anything the second time', async () => {
    const event = await createEvent(organizer.wallet_address, { status: 'FROZEN' });
    await createTicketType(event.id);

    const res = await freeze(event.id, cookie);
    expect(res.status).toBe(409);
    expect(pinImageToIPFS).not.toHaveBeenCalled();
  });

  it('will not freeze an event with no ticket types', async () => {
    const event = await createEvent(organizer.wallet_address);
    const res = await freeze(event.id, cookie);
    expect(res.status).toBe(400);
    expect(pinImageToIPFS).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'PUBLISHED'] as const)('will not publish an event that is %s', async (status) => {
    const event = await createEvent(organizer.wallet_address, {
      status,
      contract_event_id: status === 'PUBLISHED' ? 1n : undefined,
    });
    const res = await publish(event.id, cookie, 2);
    expect(res.status).toBe(409);
  });
});

describe('organizer ownership', () => {
  let otherCookie: string;

  beforeEach(async () => {
    const other = await createUser({ role: 'ORGANIZER' });
    otherCookie = authCookie(other.wallet_address, 'ORGANIZER');
  });

  it('blocks another organizer from editing the event', async () => {
    const event = await createEvent(organizer.wallet_address);
    const res = await request(app).put(`/api/events/${event.id}`).set('Cookie', otherCookie).send({ title: 'Mine now' });
    expect(res.status).toBe(403);
  });

  it('blocks another organizer from freezing the event before anything is pinned', async () => {
    const event = await createEvent(organizer.wallet_address);
    await createTicketType(event.id);

    const res = await freeze(event.id, otherCookie);
    expect(res.status).toBe(403);
    expect(pinImageToIPFS).not.toHaveBeenCalled();
    expect(pinMetadataToIPFS).not.toHaveBeenCalled();
  });

  it('blocks another organizer from publishing the event', async () => {
    const event = await createEvent(organizer.wallet_address, { status: 'FROZEN' });
    const res = await publish(event.id, otherCookie);
    expect(res.status).toBe(403);
  });

  it('blocks another organizer from adding or editing ticket types', async () => {
    const event = await createEvent(organizer.wallet_address);
    const ticketType = await createTicketType(event.id);

    const add = await request(app)
      .post(`/api/events/${event.id}/ticket-types`)
      .set('Cookie', otherCookie)
      .send({ name: 'VIP', price: 100, supply: 10 });
    expect(add.status).toBe(403);

    const edit = await request(app).put(`/api/ticket-types/${ticketType.id}`).set('Cookie', otherCookie).send({ supply: 1 });
    expect(edit.status).toBe(403);
  });

  it.each(['scanners', 'whitelist'])('blocks another organizer from viewing the %s', async (path) => {
    const event = await createEvent(organizer.wallet_address);
    const res = await request(app).get(`/api/events/${event.id}/${path}`).set('Cookie', otherCookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 for events that do not exist', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';

    expect((await request(app).put(`/api/events/${missing}`).set('Cookie', cookie).send({ title: 'x' })).status).toBe(404);
    expect((await publish(missing, cookie)).status).toBe(404);
    expect((await freeze(missing, cookie)).status).toBe(404);
  });
});
