import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { resetDb, createUser, randomWallet } from './helpers/db';
import { authCookie } from './helpers/auth';

const newEvent = { title: 'Middleware Test Event', start_date: '2030-01-01T20:00:00Z' };

describe('authenticate', () => {
  beforeEach(resetDb);

  it('rejects requests with no session cookie', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('rejects a token that is not a valid JWT', async () => {
    const res = await request(app).get('/api/users/me').set('Cookie', 'token=not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = jwt.sign({ wallet_address: randomWallet(), role: 'USER' }, 'some-other-secret');
    const res = await request(app).get('/api/users/me').set('Cookie', `token=${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const user = await createUser();
    const token = jwt.sign(
      { wallet_address: user.wallet_address, role: 'USER', exp: Math.floor(Date.now() / 1000) - 60 },
      process.env.JWT_SECRET!
    );
    const res = await request(app).get('/api/users/me').set('Cookie', `token=${token}`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid session', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/users/me').set('Cookie', authCookie(user.wallet_address));
    expect(res.status).toBe(200);
    expect(res.body.wallet_address).toBe(user.wallet_address);
  });
});

describe('requireRole', () => {
  beforeEach(resetDb);

  it('blocks a USER from organizer routes', async () => {
    const user = await createUser({ role: 'USER' });
    const res = await request(app).post('/api/events').set('Cookie', authCookie(user.wallet_address, 'USER')).send(newEvent);
    expect(res.status).toBe(403);
  });

  it('blocks a SCANNER from organizer routes', async () => {
    const scanner = await createUser({ role: 'SCANNER' });
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', authCookie(scanner.wallet_address, 'SCANNER'))
      .send(newEvent);
    expect(res.status).toBe(403);
  });

  it('blocks an ORGANIZER from scanner routes', async () => {
    const organizer = await createUser({ role: 'ORGANIZER' });
    const res = await request(app)
      .get('/api/tickets/1/validate')
      .query({ eventId: 'any' })
      .set('Cookie', authCookie(organizer.wallet_address, 'ORGANIZER'));
    expect(res.status).toBe(403);
  });

  it('lets an ORGANIZER through to organizer routes', async () => {
    const organizer = await createUser({ role: 'ORGANIZER' });
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', authCookie(organizer.wallet_address, 'ORGANIZER'))
      .send(newEvent);
    expect(res.status).toBe(201);
  });

  it('checks the role before the email, so the wrong role gets a role error', async () => {
    const user = await createUser({ role: 'USER', email: null });
    const res = await request(app).post('/api/events').set('Cookie', authCookie(user.wallet_address, 'USER')).send(newEvent);
    expect(res.status).toBe(403);
    expect(res.body.code).toBeUndefined();
  });
});

describe('requireEmail', () => {
  beforeEach(resetDb);

  it('blocks a user without an email from protected routes', async () => {
    const user = await createUser({ email: null });
    const res = await request(app).get('/api/tickets').set('Cookie', authCookie(user.wallet_address));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_REQUIRED');
  });

  it('blocks an organizer without an email from organizer routes', async () => {
    const organizer = await createUser({ role: 'ORGANIZER', email: null });
    const res = await request(app)
      .post('/api/events')
      .set('Cookie', authCookie(organizer.wallet_address, 'ORGANIZER'))
      .send(newEvent);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_REQUIRED');
  });

  it('lets a user with an email through', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/tickets').set('Cookie', authCookie(user.wallet_address));
    expect(res.status).toBe(200);
  });

  it('leaves /users/me open so the email step can be completed', async () => {
    const user = await createUser({ email: null });
    const cookie = authCookie(user.wallet_address);

    const me = await request(app).get('/api/users/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.profile_complete).toBe(false);

    const update = await request(app).put('/api/users/me').set('Cookie', cookie).send({ email: 'New@Test.local' });
    expect(update.status).toBe(200);
    expect(update.body.email).toBe('new@test.local');
    expect(update.body.profile_complete).toBe(true);

    const tickets = await request(app).get('/api/tickets').set('Cookie', cookie);
    expect(tickets.status).toBe(200);
  });
});
