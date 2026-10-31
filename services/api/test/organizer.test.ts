import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { User } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, randomWallet } from './helpers/db';
import { authCookie } from './helpers/auth';

const txHash = `0x${'ab'.repeat(32)}`;

function postOrganizerRequest(cookie: string, body: object = {}) {
  return request(app).post('/api/users/me/organizer-request').set('Cookie', cookie).send(body);
}

describe('organizer requests', () => {
  let user: User;
  let userCookie: string;

  beforeEach(async () => {
    await resetDb();
    user = await createUser({ role: 'USER' });
    userCookie = authCookie(user.wallet_address, 'USER');
  });

  it('requires a session', async () => {
    const res = await request(app).post('/api/users/me/organizer-request').send({});
    expect(res.status).toBe(401);
  });

  it('requires a completed account', async () => {
    const incomplete = await createUser({ role: 'USER', email: null });
    const res = await postOrganizerRequest(authCookie(incomplete.wallet_address, 'USER'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_REQUIRED');
  });

  it('stores the request with the optional details', async () => {
    const res = await postOrganizerRequest(userCookie, {
      organization_name: '  Monark Events  ',
      message: '  We run local concerts.  ',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      wallet: user.wallet_address,
      organization_name: 'Monark Events',
      message: 'We run local concerts.',
      status: 'PENDING',
    });
  });

  it('rejects a second pending request', async () => {
    await postOrganizerRequest(userCookie);
    const res = await postOrganizerRequest(userCookie);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('You already have a pending organizer request');
  });

  it.each(['ORGANIZER', 'SCANNER', 'ADMIN'] as const)('does not let a %s apply', async (role) => {
    const other = await createUser({ role });
    const res = await postOrganizerRequest(authCookie(other.wallet_address, role));
    expect(res.status).toBe(409);
  });

  it('lets a rejected user apply again', async () => {
    const first = await postOrganizerRequest(userCookie);
    await prisma.organizerRequest.update({
      where: { id: first.body.id },
      data: { status: 'REJECTED' },
    });

    const second = await postOrganizerRequest(userCookie);
    expect(second.status).toBe(201);
  });

  it('rejects text that is too long', async () => {
    const res = await postOrganizerRequest(userCookie, {
      organization_name: 'a'.repeat(201),
      message: 'b'.repeat(1001),
    });
    expect(res.status).toBe(400);
  });

  it('returns the latest request, or 404 when there is none', async () => {
    expect((await request(app).get('/api/users/me/organizer-request').set('Cookie', userCookie)).status).toBe(404);

    await postOrganizerRequest(userCookie);
    const res = await request(app).get('/api/users/me/organizer-request').set('Cookie', userCookie);
    expect(res.status).toBe(200);
    expect(res.body.wallet).toBe(user.wallet_address);
  });
});

describe('admin organizer management', () => {
  let admin: User;
  let adminCookie: string;
  let user: User;
  let userCookie: string;

  beforeEach(async () => {
    await resetDb();
    admin = await createUser({ role: 'ADMIN' });
    adminCookie = authCookie(admin.wallet_address, 'ADMIN');
    user = await createUser({ role: 'USER' });
    userCookie = authCookie(user.wallet_address, 'USER');
  });

  it('blocks regular users from every admin endpoint', async () => {
    expect((await request(app).get('/api/admin/organizer-requests').set('Cookie', userCookie)).status).toBe(403);
    expect((await request(app).post(`/api/admin/organizers/${user.wallet_address}`).set('Cookie', userCookie)).status).toBe(403);
    expect((await request(app).delete(`/api/admin/organizers/${user.wallet_address}`).set('Cookie', userCookie)).status).toBe(403);
  });

  it('checks the role before the email on admin routes', async () => {
    const incomplete = await createUser({ role: 'USER', email: null });
    const res = await request(app)
      .get('/api/admin/organizer-requests')
      .set('Cookie', authCookie(incomplete.wallet_address, 'USER'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBeUndefined();
  });

  it('lists every request and can filter by status', async () => {
    await postOrganizerRequest(userCookie);
    const other = await createUser({ role: 'USER' });
    await postOrganizerRequest(authCookie(other.wallet_address, 'USER'));
    await prisma.organizerRequest.updateMany({ where: { wallet: other.wallet_address }, data: { status: 'REJECTED' } });

    const all = await request(app).get('/api/admin/organizer-requests').set('Cookie', adminCookie);
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(2);
    expect(all.body.some((item: { user: { email: string } }) => item.user.email === user.email)).toBe(true);

    const pending = await request(app).get('/api/admin/organizer-requests?status=PENDING').set('Cookie', adminCookie);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0].wallet).toBe(user.wallet_address);

    const invalid = await request(app).get('/api/admin/organizer-requests?status=UNKNOWN').set('Cookie', adminCookie);
    expect(invalid.status).toBe(400);
  });

  it('rejects a pending request and records the admin and reason', async () => {
    const created = await postOrganizerRequest(userCookie);

    const res = await request(app)
      .post(`/api/admin/organizer-requests/${created.body.id}/reject`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Not enough information' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'REJECTED',
      reviewed_by: admin.wallet_address,
      rejection_reason: 'Not enough information',
    });
  });

  it('does not reject a request twice or one that does not exist', async () => {
    const created = await postOrganizerRequest(userCookie);
    await request(app).post(`/api/admin/organizer-requests/${created.body.id}/reject`).set('Cookie', adminCookie);

    const again = await request(app)
      .post(`/api/admin/organizer-requests/${created.body.id}/reject`)
      .set('Cookie', adminCookie);
    expect(again.status).toBe(409);

    const missing = await request(app)
      .post('/api/admin/organizer-requests/00000000-0000-0000-0000-000000000000/reject')
      .set('Cookie', adminCookie);
    expect(missing.status).toBe(404);
  });

  it('promotes a user, approves their request, and the old session gets organizer access', async () => {
    const created = await postOrganizerRequest(userCookie);

    const res = await request(app)
      .post(`/api/admin/organizers/${user.wallet_address}`)
      .set('Cookie', adminCookie)
      .send({ tx_hash: txHash });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ORGANIZER');
    expect(res.body.user.nonce).toBeUndefined();
    expect(res.body.request).toMatchObject({
      status: 'APPROVED',
      reviewed_by: admin.wallet_address,
      tx_hash: txHash,
    });

    // The cookie still says USER, but requireRole reads the database
    const event = await request(app)
      .post('/api/events')
      .set('Cookie', userCookie)
      .send({ title: 'Promoted Organizer Event', start_date: '2030-01-01T20:00:00Z' });
    expect(event.status).toBe(201);

    expect((await prisma.organizerRequest.findUnique({ where: { id: created.body.id } }))!.status).toBe('APPROVED');
  });

  it('promotes a user without a request', async () => {
    const res = await request(app)
      .post(`/api/admin/organizers/${user.wallet_address}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ORGANIZER');
    expect(res.body.request).toBeNull();
  });

  it('validates the wallet and transaction hash', async () => {
    expect((await request(app).post('/api/admin/organizers/not-a-wallet').set('Cookie', adminCookie)).status).toBe(400);
    expect(
      (await request(app)
        .post(`/api/admin/organizers/${user.wallet_address}`)
        .set('Cookie', adminCookie)
        .send({ tx_hash: '0x1234' })).status
    ).toBe(400);
  });

  it('does not promote an admin or a wallet without an account', async () => {
    expect((await request(app).post(`/api/admin/organizers/${admin.wallet_address}`).set('Cookie', adminCookie)).status).toBe(409);
    expect((await request(app).post(`/api/admin/organizers/${randomWallet()}`).set('Cookie', adminCookie)).status).toBe(404);
  });

  it('revokes organizer access and the old session is blocked immediately', async () => {
    const organizer = await createUser({ role: 'ORGANIZER' });
    const organizerCookie = authCookie(organizer.wallet_address, 'ORGANIZER');

    const res = await request(app)
      .delete(`/api/admin/organizers/${organizer.wallet_address}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('USER');

    const event = await request(app)
      .post('/api/events')
      .set('Cookie', organizerCookie)
      .send({ title: 'No Longer Allowed', start_date: '2030-01-01T20:00:00Z' });
    expect(event.status).toBe(403);
  });

  it('does not revoke an admin, an attendee or an unknown wallet', async () => {
    expect((await request(app).delete(`/api/admin/organizers/${admin.wallet_address}`).set('Cookie', adminCookie)).status).toBe(409);
    expect((await request(app).delete(`/api/admin/organizers/${user.wallet_address}`).set('Cookie', adminCookie)).status).toBe(409);
    expect((await request(app).delete(`/api/admin/organizers/${randomWallet()}`).set('Cookie', adminCookie)).status).toBe(404);
  });
});
