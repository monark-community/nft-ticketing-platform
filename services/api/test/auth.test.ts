import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb } from './helpers/db';

const loginMessage = (nonce: string) =>
  `Sign this message to authenticate with NFTokenPass.\n\nNonce: ${nonce}`;

async function getNonce(wallet: string): Promise<string> {
  const res = await request(app).get('/api/auth/nonce').query({ wallet });
  expect(res.status).toBe(200);
  return res.body.nonce;
}

function tokenCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith('token='));
}

describe('wallet login', () => {
  let wallet: ethers.HDNodeWallet;

  beforeEach(async () => {
    await resetDb();
    wallet = ethers.Wallet.createRandom();
  });

  describe('GET /api/auth/nonce', () => {
    it('requires a wallet', async () => {
      const res = await request(app).get('/api/auth/nonce');
      expect(res.status).toBe(400);
    });

    it('creates the user on first request and stores the nonce', async () => {
      const nonce = await getNonce(wallet.address);

      const user = await prisma.user.findUnique({ where: { wallet_address: wallet.address.toLowerCase() } });
      expect(user).not.toBeNull();
      expect(user!.nonce).toBe(nonce);
      expect(user!.role).toBe('USER');
      expect(user!.email).toBeNull();
    });

    it('issues a new nonce on every request', async () => {
      const first = await getNonce(wallet.address);
      const second = await getNonce(wallet.address);

      expect(second).not.toBe(first);
      const user = await prisma.user.findUnique({ where: { wallet_address: wallet.address.toLowerCase() } });
      expect(user!.nonce).toBe(second);
    });
  });

  describe('POST /api/auth/verify', () => {
    it('requires wallet and signature', async () => {
      const res = await request(app).post('/api/auth/verify').send({ wallet: wallet.address });
      expect(res.status).toBe(400);
    });

    it('logs in with a valid signature and sets an http-only cookie', async () => {
      const nonce = await getNonce(wallet.address);
      const signature = await wallet.signMessage(loginMessage(nonce));

      const res = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        wallet_address: wallet.address.toLowerCase(),
        role: 'USER',
        profile_complete: false,
      });

      const cookie = tokenCookie(res);
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);

      const token = cookie!.split(';')[0].replace('token=', '');
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
      expect(payload.wallet_address).toBe(wallet.address.toLowerCase());
      expect(payload.role).toBe('USER');
    });

    it('clears the nonce after a successful login', async () => {
      const nonce = await getNonce(wallet.address);
      const signature = await wallet.signMessage(loginMessage(nonce));
      await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });

      const user = await prisma.user.findUnique({ where: { wallet_address: wallet.address.toLowerCase() } });
      expect(user!.nonce).toBeNull();
    });

    it('rejects a replayed signature', async () => {
      const nonce = await getNonce(wallet.address);
      const signature = await wallet.signMessage(loginMessage(nonce));

      const first = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });
      expect(first.status).toBe(200);

      const replay = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });
      expect(replay.status).toBe(401);
      expect(tokenCookie(replay)).toBeUndefined();
    });

    it('rejects a signature for an old nonce', async () => {
      const oldNonce = await getNonce(wallet.address);
      await getNonce(wallet.address);
      const signature = await wallet.signMessage(loginMessage(oldNonce));

      const res = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });
      expect(res.status).toBe(401);
    });

    it('rejects a signature from a different wallet and keeps the nonce', async () => {
      const nonce = await getNonce(wallet.address);
      const attacker = ethers.Wallet.createRandom();
      const signature = await attacker.signMessage(loginMessage(nonce));

      const res = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });
      expect(res.status).toBe(401);

      const user = await prisma.user.findUnique({ where: { wallet_address: wallet.address.toLowerCase() } });
      expect(user!.nonce).toBe(nonce);
    });

    it('rejects a malformed signature', async () => {
      await getNonce(wallet.address);
      const res = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature: '0x1234' });
      expect(res.status).toBe(401);
    });

    it('rejects a wallet that never requested a nonce', async () => {
      const signature = await wallet.signMessage(loginMessage('made-up'));
      const res = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });
      expect(res.status).toBe(401);
    });

    it('reports profile_complete once the user has an email', async () => {
      const nonce = await getNonce(wallet.address);
      await prisma.user.update({
        where: { wallet_address: wallet.address.toLowerCase() },
        data: { email: 'someone@test.local' },
      });
      const signature = await wallet.signMessage(loginMessage(nonce));

      const res = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });
      expect(res.status).toBe(200);
      expect(res.body.profile_complete).toBe(true);
    });

    it('returns a cookie that works on authenticated routes', async () => {
      const nonce = await getNonce(wallet.address);
      const signature = await wallet.signMessage(loginMessage(nonce));
      const login = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });

      const me = await request(app).get('/api/users/me').set('Cookie', tokenCookie(login)!.split(';')[0]);
      expect(me.status).toBe(200);
      expect(me.body.wallet_address).toBe(wallet.address.toLowerCase());
    });
  });

  describe('POST /api/auth/logout', () => {
    it('requires a session', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(401);
    });

    it('clears the session cookie', async () => {
      const nonce = await getNonce(wallet.address);
      const signature = await wallet.signMessage(loginMessage(nonce));
      const login = await request(app).post('/api/auth/verify').send({ wallet: wallet.address, signature });

      const res = await request(app).post('/api/auth/logout').set('Cookie', tokenCookie(login)!.split(';')[0]);
      expect(res.status).toBe(200);
      expect(tokenCookie(res)).toMatch(/^token=;/);
    });
  });
});
