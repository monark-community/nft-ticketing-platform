import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { ethers } from 'ethers';
import { Event, TicketType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { TICKET_NFT_ABI } from '../src/lib/ticketNft';
import { MAX_BLOCK_RANGE, SYNCED_EVENTS, createLogPoller, handleEvent, startBlockchainListener } from '../src/workers/blockchain.listener';
import { resetDb, createUser, createEvent, createTicketType, randomWallet, fakePayload } from './helpers/db';

// startBlockchainListener() must not reach a real node: count the providers it creates instead
const { providers } = vi.hoisted(() => ({ providers: [] as unknown[] }));
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  class FakeProvider {
    constructor(url: string) {
      providers.push(url);
    }
  }
  return { ...actual, ethers: { ...actual.ethers, JsonRpcProvider: FakeProvider } };
});

// handlers.TicketMinted(...args) runs a TicketMinted event through the listener. A fakePayload() as
// the last argument supplies the log it came from (transaction, block time).
const handlers = new Proxy({} as Record<string, (...args: any[]) => Promise<void>>, {
  get: (_target, eventName: string) => async (...args: any[]) => {
    const last = args[args.length - 1];
    const withLog = last !== null && typeof last === 'object' && 'log' in last;
    await handleEvent(eventName, withLog ? args.slice(0, -1) : args, withLog ? last.log : undefined);
  },
});

// Addresses arrive from the chain checksummed (mixed case)
const checksummed = () => ethers.getAddress(randomWallet());

describe('blockchain listener setup', () => {
  afterAll(() => vi.unstubAllEnvs());

  it('does not start without RPC_URL and CONTRACT_ADDRESS', async () => {
    vi.stubEnv('RPC_URL', '');
    vi.stubEnv('CONTRACT_ADDRESS', '');

    await startBlockchainListener();
    expect(providers).toHaveLength(0);
  });
});

describe('blockchain listener database updates', () => {
  let event: Event;
  let ticketType: TicketType;

  beforeEach(async () => {
    await resetDb();
    const organizer = await createUser({ role: 'ORGANIZER' });
    event = await createEvent(organizer.wallet_address, { status: 'PUBLISHED', contract_event_id: 5n });
    ticketType = await createTicketType(event.id, { contract_type_id: 0 });
  });

  it('has a handler for every contract event it syncs', () => {
    expect([...SYNCED_EVENTS].sort()).toEqual(
      [
        'EventConfigured',
        'ListingCancelled',
        'PresaleStatusUpdated',
        'RevenueWithdrawn',
        'SaleStatusUpdated',
        'ScannerUpdated',
        'TicketCheckedIn',
        'TicketListed',
        'TicketMinted',
        'TicketPurchased',
        'TicketResold',
        'TicketTypeConfigured',
        'Transfer',
        'WhitelistUpdated',
      ].sort()
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

    it('saves the ticket as the ticket type it was minted as (#216)', async () => {
      const vip = await createTicketType(event.id, { name: 'VIP', contract_type_id: 1 });
      await handlers.TicketMinted(1n, 5n, 1n, checksummed(), 'ipfs://ticket');

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.ticket_type_id).toBe(vip.id);
    });

    it('skips a mint whose type ID no ticket type has, instead of guessing', async () => {
      await handlers.TicketMinted(1n, 5n, 7n, checksummed(), 'ipfs://ticket');
      expect(await prisma.ticket.count()).toBe(0);
    });

    it('records the face value, transaction and block time', async () => {
      await handlers.TicketMinted(1n, 5n, 0n, checksummed(), 'ipfs://ticket', fakePayload({ txHash: '0x01', timestamp: 1_900_000_100 }));

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.face_value!.toString()).toBe('25');
      expect(ticket!.purchase_price).toBeNull();
      expect(ticket!.mint_tx_hash).toBe('0x01');
      expect(ticket!.minted_at).toEqual(new Date(1_900_000_100 * 1000));
    });

    it('keeps the current owner and check-in when the same mint is seen again', async () => {
      const buyer = checksummed();
      const later = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, buyer, 'ipfs://ticket', fakePayload({ txHash: '0x01' }));
      await handlers.Transfer(buyer, later, 1n);
      await prisma.ticket.update({ where: { token_id: 1n }, data: { status: 'USED', used_at: new Date() } });

      await handlers.TicketMinted(1n, 5n, 0n, buyer, 'ipfs://ticket', fakePayload({ txHash: '0x01' }));

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.owner_wallet).toBe(later.toLowerCase());
      expect(ticket!.status).toBe('USED');
    });

    it('fixes the ticket type of a ticket saved with the wrong one', async () => {
      const vip = await createTicketType(event.id, { name: 'VIP', contract_type_id: 1 });
      await prisma.ticket.create({
        data: { token_id: 1n, event_id: event.id, ticket_type_id: ticketType.id, owner_wallet: randomWallet() },
      });

      await handlers.TicketMinted(1n, 5n, 1n, checksummed(), 'ipfs://ticket');

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.ticket_type_id).toBe(vip.id);
    });

    it('starts the ticket over when its token ID is minted by a different transaction (chain reset)', async () => {
      const first = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, first, 'ipfs://ticket', fakePayload({ txHash: '0x01' }));
      await handlers.TicketPurchased(1n, 5n, 0n, first, 25_000_000n);
      await prisma.ticket.update({ where: { token_id: 1n }, data: { status: 'USED', used_at: new Date() } });

      const second = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, second, 'ipfs://ticket', fakePayload({ txHash: '0x02' }));

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket).toMatchObject({ owner_wallet: second.toLowerCase(), status: 'VALID', used_at: null, purchase_price: null, mint_tx_hash: '0x02' });
      expect((await prisma.ticketType.findUnique({ where: { id: ticketType.id } }))!.sold).toBe(0);
    });
  });

  it('ignores contract events it does not sync', async () => {
    await expect(handlers.UpgradesLocked(checksummed())).resolves.toBeUndefined();
  });

  describe('TicketPurchased', () => {
    it('records the price paid and counts the sale (#215)', async () => {
      const buyer = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, buyer, 'ipfs://ticket');
      await handlers.TicketPurchased(1n, 5n, 0n, buyer, 15_500_000n);

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.purchase_price!.toString()).toBe('15.5');
      expect(ticket!.face_value!.toString()).toBe('15.5');
      expect((await prisma.ticketType.findUnique({ where: { id: ticketType.id } }))!.sold).toBe(1);
    });

    it('counts a purchase seen twice only once', async () => {
      const buyer = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, buyer, 'ipfs://ticket');
      await handlers.TicketPurchased(1n, 5n, 0n, buyer, 15_000_000n);
      await handlers.TicketPurchased(1n, 5n, 0n, buyer, 15_000_000n);

      expect((await prisma.ticketType.findUnique({ where: { id: ticketType.id } }))!.sold).toBe(1);
    });

    it('does not count tickets the organizer issued as sales', async () => {
      await handlers.TicketMinted(1n, 5n, 0n, checksummed(), 'ipfs://ticket');
      await handlers.TicketMinted(2n, 5n, 0n, checksummed(), 'ipfs://ticket');
      await handlers.TicketPurchased(2n, 5n, 0n, checksummed(), 15_000_000n);

      expect((await prisma.ticketType.findUnique({ where: { id: ticketType.id } }))!.sold).toBe(1);
    });

    it('skips a purchase whose ticket was never saved', async () => {
      await handlers.TicketPurchased(9n, 5n, 0n, checksummed(), 15_000_000n);
      expect(await prisma.ticket.count()).toBe(0);
    });
  });

  describe('TicketTypeConfigured', () => {
    it('links the type the contract added to the frozen ticket type with the same metadata (#216)', async () => {
      const vip = await createTicketType(event.id, { name: 'VIP', ipfs_hash: 'bafyvip' });
      await handlers.TicketTypeConfigured(5n, 1n, 28_000_000n, 300n, 'ipfs://bafyvip');

      const saved = await prisma.ticketType.findUnique({ where: { id: vip.id } });
      expect(saved).toMatchObject({ contract_type_id: 1, supply: 300 });
      expect(saved!.price.toString()).toBe('28');
    });

    it('updates the price and supply of a type that is already linked', async () => {
      await handlers.TicketTypeConfigured(5n, 0n, 12_500_000n, 50n, 'ipfs://changed');

      const saved = await prisma.ticketType.findUnique({ where: { id: ticketType.id } });
      expect(saved!.price.toString()).toBe('12.5');
      expect(saved!.supply).toBe(50);
    });

    it('changes nothing when no ticket type matches', async () => {
      const other = await createTicketType(event.id, { name: 'Other', ipfs_hash: 'bafyother' });
      await handlers.TicketTypeConfigured(5n, 3n, 1_000_000n, 10n, 'ipfs://bafyunknown');

      expect((await prisma.ticketType.findUnique({ where: { id: other.id } }))!.contract_type_id).toBeNull();
    });

    it('waits for publish when the API does not know the event yet', async () => {
      const draft = await createEvent(event.organizer_wallet, { status: 'FROZEN' });
      const type = await createTicketType(draft.id, { ipfs_hash: 'bafydraft' });
      await handlers.TicketTypeConfigured(77n, 0n, 1_000_000n, 10n, 'ipfs://bafydraft');

      expect((await prisma.ticketType.findUnique({ where: { id: type.id } }))!.contract_type_id).toBeNull();
    });
  });

  describe('EventConfigured', () => {
    it('saves the event settings (#299)', async () => {
      const endTime = 1_900_000_000n;
      await handlers.EventConfigured(5n, ethers.getAddress(event.organizer_wallet), endTime, 1000n, 20000n, 4n);

      const saved = await prisma.event.findUnique({ where: { id: event.id } });
      expect(saved).toMatchObject({ royalty_bps: 1000, resale_cap_bps: 20000, per_wallet_limit: 4 });
      expect(saved!.sales_end_at).toEqual(new Date(Number(endTime) * 1000));
    });

    it('saves an admin change made after the organizer set the event up', async () => {
      await handlers.EventConfigured(5n, ethers.getAddress(event.organizer_wallet), 1_900_000_000n, 1000n, 20000n, 4n);
      await handlers.EventConfigured(5n, ethers.getAddress(event.organizer_wallet), 1_900_000_000n, 500n, 15000n, 0n);

      const saved = await prisma.event.findUnique({ where: { id: event.id } });
      expect(saved).toMatchObject({ royalty_bps: 500, resale_cap_bps: 15000, per_wallet_limit: 0 });
    });

    it('still saves the settings when the on-chain organizer differs from the API (it logs a warning)', async () => {
      await handlers.EventConfigured(5n, checksummed(), 1_900_000_000n, 800n, 0n, 2n);
      expect((await prisma.event.findUnique({ where: { id: event.id } }))!.royalty_bps).toBe(800);
    });

    it('ignores events it does not know about', async () => {
      await handlers.EventConfigured(999n, checksummed(), 1_900_000_000n, 800n, 0n, 2n);
      expect((await prisma.event.findUnique({ where: { id: event.id } }))!.royalty_bps).toBeNull();
    });
  });

  describe('SaleStatusUpdated and PresaleStatusUpdated', () => {
    it('saves whether sales and the presale are on', async () => {
      await handlers.SaleStatusUpdated(5n, true);
      await handlers.PresaleStatusUpdated(5n, true);
      expect(await prisma.event.findUnique({ where: { id: event.id } })).toMatchObject({ sale_active: true, presale_active: true });

      await handlers.SaleStatusUpdated(5n, false);
      await handlers.PresaleStatusUpdated(5n, false);
      expect(await prisma.event.findUnique({ where: { id: event.id } })).toMatchObject({ sale_active: false, presale_active: false });
    });
  });

  describe('RevenueWithdrawn', () => {
    it('records the withdrawal in USDC, dated by its block', async () => {
      await handlers.RevenueWithdrawn(5n, checksummed(), 8_000_000_000n, fakePayload({ txHash: '0x0a', logIndex: 3, timestamp: 1_900_000_200 }));

      const [withdrawal] = await prisma.withdrawal.findMany();
      expect(withdrawal.amount.toString()).toBe('8000');
      expect(withdrawal).toMatchObject({ event_id: event.id, tx_hash: '0x0a', log_index: 3 });
      expect(withdrawal.withdrawn_at).toEqual(new Date(1_900_000_200 * 1000));
    });

    it('records the same withdrawal only once', async () => {
      const organizer = checksummed();
      await handlers.RevenueWithdrawn(5n, organizer, 1_000_000n, fakePayload({ txHash: '0x0a', logIndex: 3 }));
      await handlers.RevenueWithdrawn(5n, organizer, 1_000_000n, fakePayload({ txHash: '0x0a', logIndex: 3 }));
      await handlers.RevenueWithdrawn(5n, organizer, 2_000_000n, fakePayload({ txHash: '0x0b', logIndex: 0 }));

      expect(await prisma.withdrawal.count()).toBe(2);
    });

    it('ignores events it does not know about', async () => {
      await handlers.RevenueWithdrawn(999n, checksummed(), 1_000_000n, fakePayload());
      expect(await prisma.withdrawal.count()).toBe(0);
    });
  });

  describe('resale listings (#299)', () => {
    let seller: string;

    beforeEach(async () => {
      seller = checksummed();
      await handlers.TicketMinted(1n, 5n, 0n, seller, 'ipfs://ticket');
    });

    it('TicketListed saves the listing', async () => {
      await handlers.TicketListed(1n, seller, 22_000_000n, fakePayload({ txHash: '0x0c', timestamp: 1_900_000_300 }));

      const listing = await prisma.listing.findUnique({ where: { token_id: 1n } });
      expect(listing).toMatchObject({ seller_wallet: seller.toLowerCase(), tx_hash: '0x0c' });
      expect(listing!.price.toString()).toBe('22');
      expect(listing!.listed_at).toEqual(new Date(1_900_000_300 * 1000));
    });

    it('TicketListed again changes the price', async () => {
      await handlers.TicketListed(1n, seller, 22_000_000n, fakePayload());
      await handlers.TicketListed(1n, seller, 20_000_000n, fakePayload());

      expect(await prisma.listing.count()).toBe(1);
      expect((await prisma.listing.findUnique({ where: { token_id: 1n } }))!.price.toString()).toBe('20');
    });

    it('TicketListed skips tickets it does not know about', async () => {
      await handlers.TicketListed(9n, seller, 22_000_000n, fakePayload());
      expect(await prisma.listing.count()).toBe(0);
    });

    it('ListingCancelled removes the listing', async () => {
      await handlers.TicketListed(1n, seller, 22_000_000n, fakePayload());
      await handlers.ListingCancelled(1n, seller);
      expect(await prisma.listing.count()).toBe(0);
    });

    it('TicketResold gives the ticket to the buyer and removes the listing', async () => {
      const buyer = checksummed();
      await handlers.TicketListed(1n, seller, 22_000_000n, fakePayload());
      await handlers.TicketResold(1n, seller, buyer, 22_000_000n);

      expect((await prisma.ticket.findUnique({ where: { token_id: 1n } }))!.owner_wallet).toBe(buyer.toLowerCase());
      expect(await prisma.listing.count()).toBe(0);
    });

    it('a plain transfer also ends the listing, like on the contract', async () => {
      await handlers.TicketListed(1n, seller, 22_000_000n, fakePayload());
      await handlers.Transfer(seller, checksummed(), 1n);
      expect(await prisma.listing.count()).toBe(0);
    });
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

  describe('reading logs from the chain', () => {
    const CONTRACT = '0x0000000000000000000000000000000000000001';
    const iface = new ethers.Interface(TICKET_NFT_ABI);
    let blockNumber: number;
    let chainLogs: ethers.Log[];
    let failNext: boolean;
    let requests: Array<{ fromBlock: number; toBlock: number }>;

    // A log as a node returns it, encoded with the contract's real event signatures
    function chainLog(eventName: string, args: unknown[], block: number, index: number) {
      const { data, topics } = iface.encodeEventLog(eventName, args);
      return {
        address: CONTRACT, data, topics, blockNumber: block, index, transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
        getBlock: async () => ({ timestamp: 1_900_000_000 + block }),
      } as unknown as ethers.Log;
    }

    // Just the two calls the poller makes
    const provider = {
      getBlockNumber: async () => blockNumber,
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: number; toBlock: number }) => {
        requests.push({ fromBlock, toBlock });
        if (failNext) {
          failNext = false;
          throw new Error('RPC unavailable');
        }
        return chainLogs.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
      },
    } as unknown as ethers.Provider;

    beforeEach(() => {
      blockNumber = 100;
      chainLogs = [];
      failNext = false;
      requests = [];
    });

    it('handles events in the order they happened, across event types', async () => {
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      const seller = checksummed();
      // Listed then transferred away in the next block: the listing must not survive
      chainLogs = [
        chainLog('TicketMinted', [1n, 5n, 0n, seller, 'ipfs://ticket'], 101, 0),
        chainLog('TicketPurchased', [1n, 5n, 0n, seller, 15_000_000n], 101, 1),
        chainLog('TicketListed', [1n, seller, 22_000_000n], 102, 0),
        chainLog('Transfer', [seller, checksummed(), 1n], 103, 0),
      ].reverse(); // the poller doesn't rely on the node's order
      blockNumber = 103;
      await poller.poll();

      const ticket = await prisma.ticket.findUnique({ where: { token_id: 1n } });
      expect(ticket!.purchase_price!.toString()).toBe('15');
      expect(ticket!.mint_tx_hash).toBe(`0x${(101).toString(16).padStart(64, '0')}`);
      expect(await prisma.listing.count()).toBe(0);
    });

    it('keeps receiving events after a long time without new blocks', async () => {
      // The old contract.on() subscription went silent when the node dropped its idle filter
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      for (let i = 0; i < 5; i++) await poller.poll(); // nothing new for a while
      chainLogs = [chainLog('SaleStatusUpdated', [5n, true], 101, 0)];
      blockNumber = 101;
      await poller.poll();

      expect((await prisma.event.findUnique({ where: { id: event.id } }))!.sale_active).toBe(true);
    });

    it('reads the same blocks again when a request fails', async () => {
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      chainLogs = [chainLog('PresaleStatusUpdated', [5n, true], 101, 0)];
      blockNumber = 101;
      failNext = true;
      await expect(poller.poll()).rejects.toThrow('RPC unavailable');
      await poller.poll();

      expect(requests).toEqual([{ fromBlock: 101, toBlock: 101 }, { fromBlock: 101, toBlock: 101 }]);
      expect((await prisma.event.findUnique({ where: { id: event.id } }))!.presale_active).toBe(true);
    });

    it('keeps going when one event fails to save', async () => {
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      chainLogs = [
        chainLog('TicketMinted', [1n, 5n, 0n, checksummed(), 'ipfs://ticket'], 101, 0),
        // A scanner with no account: the check-in log can't be saved and the handler fails
        chainLog('TicketCheckedIn', [1n, checksummed()], 101, 1),
        chainLog('SaleStatusUpdated', [5n, true], 101, 2),
      ];
      blockNumber = 101;
      await poller.poll();

      expect((await prisma.event.findUnique({ where: { id: event.id } }))!.sale_active).toBe(true);
    });

    it(`asks for at most ${MAX_BLOCK_RANGE} blocks at a time`, async () => {
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      blockNumber = 100 + 2 * MAX_BLOCK_RANGE + 5;
      await poller.poll();

      expect(requests).toEqual([
        { fromBlock: 101, toBlock: 100 + MAX_BLOCK_RANGE },
        { fromBlock: 101 + MAX_BLOCK_RANGE, toBlock: 100 + 2 * MAX_BLOCK_RANGE },
        { fromBlock: 101 + 2 * MAX_BLOCK_RANGE, toBlock: 100 + 2 * MAX_BLOCK_RANGE + 5 },
      ]);
    });

    it('starts from the next block, and reads a restarted chain from block 0', async () => {
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      await poller.poll();
      expect(requests).toEqual([]); // nothing new since it started at block 100

      blockNumber = 3; // a new local chain
      chainLogs = [chainLog('SaleStatusUpdated', [5n, true], 2, 0)];
      await poller.poll();

      expect(requests).toEqual([{ fromBlock: 0, toBlock: 3 }]);
      expect((await prisma.event.findUnique({ where: { id: event.id } }))!.sale_active).toBe(true);
    });

    it('runs one poll at a time', async () => {
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      blockNumber = 101;
      await Promise.all([poller.poll(), poller.poll()]);
      expect(requests).toHaveLength(1);
    });

    it('ignores logs it cannot read', async () => {
      const poller = createLogPoller(provider, CONTRACT);
      await poller.start();
      chainLogs = [{ address: CONTRACT, data: '0x', topics: [ethers.id('Unknown(uint256)')], blockNumber: 101, index: 0 } as unknown as ethers.Log];
      blockNumber = 101;
      await expect(poller.poll()).resolves.toBeUndefined();
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
