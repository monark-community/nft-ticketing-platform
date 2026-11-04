import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { ethers } from 'ethers';
import { Event, User } from '@prisma/client';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb, createUser, createEvent, createTicketType } from './helpers/db';
import { authCookie } from './helpers/auth';

// What the fake contract returns for each read, per test
const { chain } = vi.hoisted(() => ({
  chain: {
    organizer: '',
    config: null as null | {
      endTime: bigint;
      resaleCapBps: bigint;
      ticketTypeCount: bigint;
      sold: bigint;
      configured: boolean;
      active: boolean;
      perWalletLimit: bigint;
    },
    royaltyBps: 0n,
    presale: false,
    types: [] as Array<{ price: bigint; maxSupply: bigint; metadataURI: string }>,
    fail: false,
  },
}));

// Reads go to a fake TicketNFT instead of a node
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  class FakeProvider {
    destroy() {}
  }
  class FakeContract {
    async eventOrganizer() {
      if (chain.fail) throw new Error('RPC unreachable');
      return chain.organizer;
    }
    async eventConfigs() {
      return chain.config ?? { endTime: 0n, resaleCapBps: 0n, ticketTypeCount: 0n, sold: 0n, configured: false, active: false, perWalletLimit: 0n };
    }
    async royaltyPercentage() {
      return chain.royaltyBps;
    }
    async presaleActive() {
      return chain.presale;
    }
    async ticketTypes(_eventId: bigint, typeId: number) {
      return { ...chain.types[typeId], sold: 0n, issued: 0n };
    }
  }
  return { ...actual, ethers: { ...actual.ethers, JsonRpcProvider: FakeProvider, Contract: FakeContract } };
});

const END_TIME = 1_900_000_000n;

let organizer: User;
let cookie: string;
let event: Event;

function publish(contractEventId: number) {
  return request(app).post(`/api/events/${event.id}/publish`).set('Cookie', cookie).send({ contract_event_id: contractEventId });
}

beforeEach(async () => {
  await resetDb();
  vi.stubEnv('RPC_URL', 'http://localhost:8545');
  vi.stubEnv('CONTRACT_ADDRESS', '0x0000000000000000000000000000000000000001');

  organizer = await createUser({ role: 'ORGANIZER' });
  cookie = authCookie(organizer.wallet_address, 'ORGANIZER');
  event = await createEvent(organizer.wallet_address, { status: 'FROZEN' });

  // The create event flow sets the event up on-chain before publishing it in the API
  chain.organizer = ethers.getAddress(organizer.wallet_address);
  chain.config = { endTime: END_TIME, resaleCapBps: 20000n, ticketTypeCount: 2n, sold: 0n, configured: true, active: true, perWalletLimit: 4n };
  chain.royaltyBps = 1000n;
  chain.presale = true;
  chain.types = [
    { price: 15_000_000n, maxSupply: 1000n, metadataURI: 'ipfs://bafy-ga' },
    { price: 28_000_000n, maxSupply: 300n, metadataURI: 'ipfs://bafy-vip' },
  ];
  chain.fail = false;
});

afterEach(() => vi.unstubAllEnvs());

describe('publishing copies the event setup from the contract', () => {
  it('saves the settings, sale status and ticket type IDs set up before publishing', async () => {
    // Created in the other order, so the link must come from the metadata, not the order
    const vip = await createTicketType(event.id, { name: 'VIP', ipfs_hash: 'bafy-vip' });
    const ga = await createTicketType(event.id, { name: 'General Admission', ipfs_hash: 'bafy-ga' });

    const res = await publish(42);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'PUBLISHED',
      contract_event_id: '42',
      sale_active: true,
      presale_active: true,
      royalty_bps: 1000,
      resale_cap_bps: 20000,
      per_wallet_limit: 4,
      sales_end_at: new Date(Number(END_TIME) * 1000).toISOString(),
    });

    const types = await prisma.ticketType.findMany({ where: { event_id: event.id } });
    expect(types.find((t) => t.id === ga.id)).toMatchObject({ contract_type_id: 0, supply: 1000 });
    expect(types.find((t) => t.id === vip.id)).toMatchObject({ contract_type_id: 1, supply: 300 });
    expect(res.body.ticket_types).toHaveLength(2);
  });

  it('still publishes when the event is not set up on-chain', async () => {
    chain.config = null;
    await createTicketType(event.id, { ipfs_hash: 'bafy-ga' });

    const res = await publish(42);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PUBLISHED', sale_active: false, royalty_bps: null });
  });

  it('still publishes when the chain cannot be reached', async () => {
    chain.fail = true;

    const res = await publish(42);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PUBLISHED');
  });

  it('skips the chain when RPC_URL is not set', async () => {
    vi.stubEnv('RPC_URL', '');

    const res = await publish(42);
    expect(res.status).toBe(200);
    expect(res.body.royalty_bps).toBeNull();
  });
});
