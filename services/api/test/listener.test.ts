import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { ethers } from 'ethers';
import { Event, TicketType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { startBlockchainListener } from '../src/workers/blockchain.listener';
import { resetDb, createUser, createEvent, createTicketType, randomWallet } from './helpers/db';

type Handler = (...args: any[]) => Promise<void>;

// Capture the handlers the listener registers instead of connecting to a real chain
const { handlers } = vi.hoisted(() => ({ handlers: {} as Record<string, Handler> }));

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  class FakeProvider {
    on() {}
  }
  class FakeContract {
    on(name: string, handler: Handler) {
      handlers[name] = handler;
    }
  }
  return { ...actual, ethers: { ...actual.ethers, JsonRpcProvider: FakeProvider, Contract: FakeContract } };
});

// Addresses arrive from the chain checksummed (mixed case)
const checksummed = () => ethers.getAddress(randomWallet());

describe('blockchain listener setup', () => {
  afterAll(() => vi.unstubAllEnvs());

  it('does not start without RPC_URL and CONTRACT_ADDRESS', async () => {
    for (const key of Object.keys(handlers)) delete handlers[key];
    vi.stubEnv('RPC_URL', '');
    vi.stubEnv('CONTRACT_ADDRESS', '');

    await startBlockchainListener();
    expect(Object.keys(handlers)).toHaveLength(0);
  });
});

describe('blockchain listener database updates', () => {
  let event: Event;
  let ticketType: TicketType;

  beforeAll(async () => {
    vi.stubEnv('RPC_URL', 'http://localhost:8545');
    vi.stubEnv('CONTRACT_ADDRESS', '0x0000000000000000000000000000000000000001');
    await startBlockchainListener();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await resetDb();
    const organizer = await createUser({ role: 'ORGANIZER' });
    event = await createEvent(organizer.wallet_address, { status: 'PUBLISHED', contract_event_id: 5n });
    ticketType = await createTicketType(event.id);
  });

  it('registers a handler for every contract event it syncs', () => {
    expect(Object.keys(handlers).sort()).toEqual(
      ['ScannerUpdated', 'TicketCheckedIn', 'TicketMinted', 'Transfer', 'WhitelistUpdated'].sort()
    );
  });

  describe('TicketMinted', () => {
    it('creates the ticket for the matching event', async () => {
      const buyer = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, buyer, 'ipfs://ticket');

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket).toMatchObject({
        event_id: event.id,
        ticket_type_id: ticketType.id,
        owner_wallet: buyer.toLowerCase(),
        status: 'VALID',
      });
    });

    it('does not create a duplicate when the same mint is seen twice', async () => {
      const buyer = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, buyer, 'ipfs://ticket');
      await handlers.TicketMinted(1n, 5n, 0n, buyer, 'ipfs://ticket');

      expect(await prisma.ticket.count()).toBe(1);
    });

    it('ignores mints for events it does not know about', async () => {
      await handlers.TicketMinted(1n, 999n, 0n, checksummed(), 'ipfs://ticket');
      expect(await prisma.ticket.count()).toBe(0);
    });

    it.todo('uses the minted typeId to pick the ticket type (currently always the event\'s first ticket type)');
  });

  describe('Transfer', () => {
    beforeEach(async () => {
      await handlers.TicketMinted(1n, 5n, 0n, checksummed(), 'ipfs://ticket');
    });

    it('updates the owner when a ticket changes hands', async () => {
      const newOwner = checksummed();
      await handlers.Transfer(checksummed(), newOwner, 1n);

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.owner_wallet).toBe(newOwner.toLowerCase());
    });

    it('ignores the Transfer that comes with a mint', async () => {
      const before = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      await handlers.Transfer(ethers.ZeroAddress, checksummed(), 1n);

      const after = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(after!.owner_wallet).toBe(before!.owner_wallet);
    });
  });

  describe('TicketCheckedIn', () => {
    beforeEach(async () => {
      await handlers.TicketMinted(1n, 5n, 0n, checksummed(), 'ipfs://ticket');
    });

    it('marks the ticket USED and logs the check-in', async () => {
      const scanner = await createUser({ role: 'SCANNER' });
      await handlers.TicketCheckedIn(1n, ethers.getAddress(scanner.wallet_address));

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.status).toBe('USED');
      expect(ticket!.used_at).toBeInstanceOf(Date);

      const logs = await prisma.checkinLog.findMany({ where: { token_id: 1n } });
      expect(logs).toHaveLength(1);
      expect(logs[0].scanner_wallet).toBe(scanner.wallet_address);
    });

    it('does nothing when the same check-in is received twice', async () => {
      const scanner = await createUser({ role: 'SCANNER' });
      await handlers.TicketCheckedIn(1n, ethers.getAddress(scanner.wallet_address));
      const first = await prisma.ticket.findUnique({ where: { token_id: 1n } });

      await handlers.TicketCheckedIn(1n, ethers.getAddress(scanner.wallet_address));

      const second = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(second!.used_at).toEqual(first!.used_at);
      expect(await prisma.checkinLog.count({ where: { token_id: 1n } })).toBe(1);
    });

    it('ignores check-ins for tickets it does not know about', async () => {
      const scanner = await createUser({ role: 'SCANNER' });
      await handlers.TicketCheckedIn(999n, ethers.getAddress(scanner.wallet_address));
      expect(await prisma.checkinLog.count()).toBe(0);
    });

    it('still marks the ticket USED when the scanner has no account, but cannot log it', async () => {
      await handlers.TicketCheckedIn(1n, checksummed());

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.status).toBe('USED');
      expect(await prisma.checkinLog.count()).toBe(0);
    });
  });

  describe.each([
    ['WhitelistUpdated', 'whitelist', 'added_by'],
    ['ScannerUpdated', 'scanner', 'assigned_by'],
  ] as const)('%s', (eventName, table, byField) => {
    const model = () => (table === 'whitelist' ? prisma.whitelist : prisma.scanner) as any;
    let wallet: string;

    beforeEach(async () => {
      wallet = randomWallet();
      await model().create({ data: { event_id: event.id, wallet, [byField]: event.organizer_wallet } });
    });

    it('marks the entry as synced when it is added on-chain', async () => {
      await handlers[eventName](5n, ethers.getAddress(wallet), true);

      const entry = await model().findFirst({ where: { event_id: event.id, wallet } });
      expect(entry.synced_to_chain).toBe(true);
    });

    it('removes the entry when it is removed on-chain', async () => {
      await handlers[eventName](5n, ethers.getAddress(wallet), false);
      expect(await model().count({ where: { event_id: event.id, wallet } })).toBe(0);
    });

    it('does not create an entry the API never added', async () => {
      await handlers[eventName](5n, checksummed(), true);
      expect(await model().count()).toBe(1);
    });

    it('ignores events it does not know about', async () => {
      await handlers[eventName](999n, ethers.getAddress(wallet), false);
      expect(await model().count()).toBe(1);
    });
  });
});
