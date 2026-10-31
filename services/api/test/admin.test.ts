import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { prisma } from '../src/lib/prisma';
import { syncAdminFromEnv } from '../src/lib/admin';
import { resetDb, createUser } from './helpers/db';

describe('syncAdminFromEnv', () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllEnvs());

  it('does nothing when ADMIN_WALLET is not set', async () => {
    vi.stubEnv('ADMIN_WALLET', '');
    await syncAdminFromEnv();
    expect(await prisma.user.count()).toBe(0);
  });

  it('creates the configured wallet as ADMIN', async () => {
    const wallet = ethers.Wallet.createRandom().address;
    vi.stubEnv('ADMIN_WALLET', wallet);

    await syncAdminFromEnv();

    const user = await prisma.user.findUnique({ where: { wallet_address: wallet.toLowerCase() } });
    expect(user!.role).toBe('ADMIN');
  });

  it('promotes an existing user to ADMIN', async () => {
    const user = await createUser({ role: 'USER' });
    vi.stubEnv('ADMIN_WALLET', user.wallet_address);

    await syncAdminFromEnv();

    const updated = await prisma.user.findUnique({ where: { wallet_address: user.wallet_address } });
    expect(updated!.role).toBe('ADMIN');
  });

  it('ignores an invalid wallet address', async () => {
    vi.stubEnv('ADMIN_WALLET', 'not-a-wallet');
    await syncAdminFromEnv();
    expect(await prisma.user.count()).toBe(0);
  });
});
