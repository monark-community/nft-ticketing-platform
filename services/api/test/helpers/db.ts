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
  overrides: {
    status?: EventStatus;
    contract_event_id?: bigint;
    title?: string;
    category?: string;
    start_date?: Date;
    end_date?: Date | null;
    resale_cap_bps?: number;
    royalty_bps?: number;
    sales_end_at?: Date;
  } = {}
) {
  return prisma.event.create({
    data: {
      organizer_wallet: organizerWallet,
      title: overrides.title ?? 'Test Event',
      category: overrides.category,
      start_date: overrides.start_date ?? new Date('2030-01-01T20:00:00Z'),
      end_date: overrides.end_date ?? null,
      status: overrides.status ?? EventStatus.DRAFT,
      contract_event_id: overrides.contract_event_id,
      resale_cap_bps: overrides.resale_cap_bps,
      royalty_bps: overrides.royalty_bps,
      sales_end_at: overrides.sales_end_at,
    },
  });
}

export async function createTicketType(
  eventId: string,
  overrides: { name?: string; price?: number; supply?: number; contract_type_id?: number; ipfs_hash?: string } = {}
) {
  return prisma.ticketType.create({
    data: {
      event_id: eventId,
      name: overrides.name ?? 'General Admission',
      price: overrides.price ?? 25,
      supply: overrides.supply ?? 100,
      contract_type_id: overrides.contract_type_id,
      ipfs_hash: overrides.ipfs_hash,
    },
  });
}

// The ContractEventPayload ethers passes after an event's arguments: just what the listener reads
export function fakePayload(options: { txHash?: string; logIndex?: number; blockNumber?: number; timestamp?: number } = {}) {
  const timestamp = options.timestamp ?? 1_900_000_000;
  return {
    log: {
      transactionHash: options.txHash ?? `0x${'ab'.repeat(32)}`,
      index: options.logIndex ?? 0,
      blockNumber: options.blockNumber ?? timestamp, // one block per timestamp, since the listener caches block times
      getBlock: async () => ({ timestamp }),
    },
  };
}
