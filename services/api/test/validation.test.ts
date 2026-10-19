import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Event, User } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, createEvent, createTicketType, randomWallet } from './helpers/db';
import { authCookie } from './helpers/auth';

let organizer: User;
let cookie: string;
let event: Event;

beforeEach(async () => {
  await resetDb();
  organizer = await createUser({ role: 'ORGANIZER' });
  cookie = authCookie(organizer.wallet_address, 'ORGANIZER');
  event = await createEvent(organizer.wallet_address);
});

describe('events', () => {
  it.each([
    ['title', { start_date: '2030-01-01T20:00:00Z' }],
    ['start_date', { title: 'No Date' }],
  ])('requires %s when creating an event', async (_field, body) => {
    const res = await request(app).post('/api/events').set('Cookie', cookie).send(body);
    expect(res.status).toBe(400);
  });

  it('requires contract_event_id when publishing', async () => {
    const res = await request(app).post(`/api/events/${event.id}/publish`).set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });

  it.each([['abc'], [1.5], [-1]])('rejects contract_event_id %s', async (value) => {
    const res = await request(app)
      .post(`/api/events/${event.id}/publish`)
      .set('Cookie', cookie)
      .send({ contract_event_id: value });
    expect(res.status).toBe(400);
  });

  it.each([
    ['start_date', { title: 'Bad Date', start_date: 'not-a-date' }],
    ['end_date', { title: 'Bad Date', start_date: '2030-01-01T20:00:00Z', end_date: 'nope' }],
  ])('rejects an invalid %s when creating an event', async (_field, body) => {
    const res = await request(app).post('/api/events').set('Cookie', cookie).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid date when editing an event', async () => {
    const res = await request(app).put(`/api/events/${event.id}`).set('Cookie', cookie).send({ start_date: 'nope' });
    expect(res.status).toBe(400);
  });

  it.each([
    ['title', { title: 123, start_date: '2030-01-01T20:00:00Z' }],
    ['description', { title: 'Event', start_date: '2030-01-01T20:00:00Z', description: { a: 1 } }],
    ['location', { title: 'Event', start_date: '2030-01-01T20:00:00Z', location: 5 }],
  ])('rejects a non-string %s', async (_field, body) => {
    const res = await request(app).post('/api/events').set('Cookie', cookie).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects an empty title when editing an event', async () => {
    const res = await request(app).put(`/api/events/${event.id}`).set('Cookie', cookie).send({ title: '  ' });
    expect(res.status).toBe(400);
  });

  it('keeps page and limit in range on GET /events', async () => {
    const res = await request(app).get('/api/events').query({ page: -3, limit: -5 });
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(1);

    const big = await request(app).get('/api/events').query({ limit: 1000 });
    expect(big.body.limit).toBe(50);
  });
});

describe('ticket types', () => {
  it.each([
    ['name', { price: 10, supply: 5 }],
    ['price', { name: 'VIP', supply: 5 }],
    ['supply', { name: 'VIP', price: 10 }],
  ])('requires %s', async (_field, body) => {
    const res = await request(app).post(`/api/events/${event.id}/ticket-types`).set('Cookie', cookie).send(body);
    expect(res.status).toBe(400);
  });

  it('handles a request with no body', async () => {
    const res = await request(app).post(`/api/events/${event.id}/ticket-types`).set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it.each([
    ['a non-numeric price', { name: 'VIP', price: 'abc', supply: 5 }],
    ['a negative price', { name: 'VIP', price: -5, supply: 5 }],
    ['a non-numeric supply', { name: 'VIP', price: 10, supply: 'lots' }],
    ['a negative supply', { name: 'VIP', price: 10, supply: -1 }],
    ['a supply of 0', { name: 'VIP', price: 10, supply: 0 }],
    ['a fractional supply', { name: 'VIP', price: 10, supply: 1.5 }],
    ['a non-string name', { name: 42, price: 10, supply: 5 }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).post(`/api/events/${event.id}/ticket-types`).set('Cookie', cookie).send(body);
    expect(res.status).toBe(400);
  });

  it('accepts a free ticket and a price sent as a string', async () => {
    const free = await request(app)
      .post(`/api/events/${event.id}/ticket-types`)
      .set('Cookie', cookie)
      .send({ name: 'Free', price: 0, supply: 10 });
    expect(free.status).toBe(201);

    const priced = await request(app)
      .post(`/api/events/${event.id}/ticket-types`)
      .set('Cookie', cookie)
      .send({ name: 'Standard', price: '19.99', supply: 10 });
    expect(priced.status).toBe(201);
    expect(priced.body.price).toBe('19.99');
  });

  it('applies the same checks when editing a ticket type', async () => {
    const ticketType = await createTicketType(event.id);
    const res = await request(app).put(`/api/ticket-types/${ticketType.id}`).set('Cookie', cookie).send({ supply: 'lots' });
    expect(res.status).toBe(400);
  });
});

describe('event image upload', () => {
  it('requires an image file', async () => {
    const res = await request(app).post(`/api/events/${event.id}/freeze`).set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('rejects unsupported file types', async () => {
    const res = await request(app)
      .post(`/api/events/${event.id}/freeze`)
      .set('Cookie', cookie)
      .attach('image', Buffer.from('GIF89a'), { filename: 'poster.gif', contentType: 'image/gif' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unsupported file type/);
  });

  it('rejects files over 10 MB', async () => {
    const res = await request(app)
      .post(`/api/events/${event.id}/freeze`)
      .set('Cookie', cookie)
      .attach('image', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'huge.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10 MB/);
  });
});

describe('tickets', () => {
  it('rejects a non-numeric token id', async () => {
    const res = await request(app).get('/api/tickets/abc');
    expect(res.status).toBe(400);
  });

  it('requires eventId when validating a ticket', async () => {
    const scanner = await createUser({ role: 'SCANNER' });
    const res = await request(app)
      .get('/api/tickets/1/validate')
      .set('Cookie', authCookie(scanner.wallet_address, 'SCANNER'));
    expect(res.status).toBe(400);
  });
});

describe('scanners and whitelist', () => {
  it.each([[undefined], ['not-a-wallet'], [12345]])('rejects scanner wallet %s', async (wallet) => {
    const res = await request(app).post(`/api/events/${event.id}/scanners`).set('Cookie', cookie).send({ wallet });
    expect(res.status).toBe(400);
  });

  it.each([
    ['missing', undefined],
    ['not an array', 'x'],
    ['empty', []],
    ['with an invalid entry', [randomWallet(), 'nope']],
  ])('rejects a whitelist that is %s', async (_label, wallets) => {
    const res = await request(app).post(`/api/events/${event.id}/whitelist`).set('Cookie', cookie).send({ wallets });
    expect(res.status).toBe(400);
  });

  it('rejects a scanner wallet that has no platform account', async () => {
    const res = await request(app)
      .post(`/api/events/${event.id}/scanners`)
      .set('Cookie', cookie)
      .send({ wallet: randomWallet() });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('WALLET_NOT_REGISTERED');
  });

  it('rejects a wallet whose account has no email yet', async () => {
    const halfSignedUp = await createUser({ email: null });
    const res = await request(app)
      .post(`/api/events/${event.id}/scanners`)
      .set('Cookie', cookie)
      .send({ wallet: halfSignedUp.wallet_address });
    expect(res.status).toBe(422);
  });

  it('rejects the whole whitelist batch and lists the unregistered wallets', async () => {
    const registered = await createUser();
    const unregistered = randomWallet();

    const res = await request(app)
      .post(`/api/events/${event.id}/whitelist`)
      .set('Cookie', cookie)
      .send({ wallets: [registered.wallet_address, unregistered] });

    expect(res.status).toBe(422);
    expect(res.body.wallets).toEqual([unregistered]);

    const list = await request(app).get(`/api/events/${event.id}/whitelist`).set('Cookie', cookie);
    expect(list.body).toHaveLength(0);
  });

  it('accepts registered wallets', async () => {
    const scanner = await createUser();
    const res = await request(app)
      .post(`/api/events/${event.id}/scanners`)
      .set('Cookie', cookie)
      .send({ wallet: scanner.wallet_address });
    expect(res.status).toBe(201);
  });
});

describe('user profile', () => {
  it.each([['not-an-email'], [''], [5]])('rejects email %s', async (email) => {
    const res = await request(app).put('/api/users/me').set('Cookie', cookie).send({ email });
    expect(res.status).toBe(400);
  });

  it('rejects an email that another account already uses', async () => {
    const other = await createUser({ email: 'taken@test.local' });
    expect(other.email).toBe('taken@test.local');

    const res = await request(app).put('/api/users/me').set('Cookie', cookie).send({ email: 'Taken@Test.local' });
    expect(res.status).toBe(409);
  });

  it('rejects a non-string nickname', async () => {
    const res = await request(app).put('/api/users/me').set('Cookie', cookie).send({ nickname: { a: 1 } });
    expect(res.status).toBe(400);
  });
});

describe('request format', () => {
  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
  });

  it('rejects a malformed wallet on GET /auth/nonce without creating a user', async () => {
    const res = await request(app).get('/api/auth/nonce').query({ wallet: 'hello' });
    expect(res.status).toBe(400);
    expect(await prisma.user.count({ where: { wallet_address: 'hello' } })).toBe(0);
  });

  it('rejects a non-string wallet or signature on POST /auth/verify', async () => {
    const res = await request(app).post('/api/auth/verify').send({ wallet: { a: 1 }, signature: 'x' });
    expect(res.status).toBe(400);
  });
});
