import { ethers } from 'ethers';
import { EventStatus, Role } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { assertTestDatabase } from '../testEnv';

// Empties every table (except Prisma's migration history) so each test starts clean
export async function resetDb(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL!);

  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export function randomWallet(): string {
  return ethers.Wallet.createRandom().address.toLowerCase();
}

let emailCounter = 0;

export async function createUser(overrides: { wallet_address?: string; role?: Role; email?: string | null } = {}) {
  const wallet_address = overrides.wallet_address ?? randomWallet();
  return prisma.user.create({
    data: {
      wallet_address,
      role: overrides.role ?? Role.USER,
      email: overrides.email === undefined ? `user${++emailCounter}@test.local` : overrides.email,
    },
  });
}

export async function createEvent(
  organizerWallet: string,
  overrides: { status?: EventStatus; contract_event_id?: bigint; title?: string } = {}
) {
  return prisma.event.create({
    data: {
      organizer_wallet: organizerWallet,
      title: overrides.title ?? 'Test Event',
      start_date: new Date('2030-01-01T20:00:00Z'),
      status: overrides.status ?? EventStatus.DRAFT,
      contract_event_id: overrides.contract_event_id,
    },
  });
}

export async function createTicketType(eventId: string, overrides: { name?: string; supply?: number } = {}) {
  return prisma.ticketType.create({
    data: {
      event_id: eventId,
      name: overrides.name ?? 'General Admission',
      price: 25,
      supply: overrides.supply ?? 100,
    },
  });
}
