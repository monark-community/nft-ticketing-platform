import { ethers } from 'ethers';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { TICKET_NFT_ABI } from '../lib/ticketNft';
import {
  LogMeta,
  applyEventSettings,
  applyTicketType,
  recordListing,
  recordMint,
  recordPurchase,
  recordResale,
  recordTransfer,
  recordWithdrawal,
  removeListing,
  setPresaleActive,
  setSaleActive,
} from '../services/sync.service';

// Each handler gets the event's arguments, then { log } with the log they came from
type Handler = (...args: any[]) => Promise<void>;
type LogPayload = { log: ethers.Log } | undefined;

// Block timestamps, so rows are dated when the transaction happened rather than when it was seen.
// Logs from the same block share one lookup.
const blockTimes = new Map<number, Date>();
const MAX_CACHED_BLOCKS = 500;

async function blockTime(log: ethers.Log): Promise<Date> {
  const cached = blockTimes.get(log.blockNumber);
  if (cached) return cached;
  try {
    const block = await log.getBlock();
    const time = new Date(block.timestamp * 1000);
    if (blockTimes.size >= MAX_CACHED_BLOCKS) blockTimes.delete(blockTimes.keys().next().value!);
    blockTimes.set(log.blockNumber, time);
    return time;
  } catch {
    return new Date();
  }
}

async function logMeta(payload: LogPayload): Promise<LogMeta> {
  const log = payload?.log;
  if (!log) return { txHash: null, logIndex: null, blockTime: new Date() };
  return { txHash: log.transactionHash, logIndex: log.index, blockTime: await blockTime(log) };
}

// One handler per contract event the database keeps a copy of
const HANDLERS: Record<string, Handler> = {
  // ERC-721 Transfer — update ticket ownership when a ticket is transferred
  Transfer: async (from: string, to: string, tokenId: bigint) => {
    // Ignore mint events (from zero address) — handled by TicketMinted
    if (from === ethers.ZeroAddress) return;

    await recordTransfer(tokenId, to);
    logger.info(`Transfer: token ${tokenId} ownership updated to ${to}`);
  },

  // TicketMinted — save every new ticket with the ticket type it was minted as (#216)
  TicketMinted: async (tokenId: bigint, eventId: bigint, typeId: bigint, to: string, _tokenURI: string, payload?: LogPayload) => {
    await recordMint(tokenId, eventId, typeId, to, await logMeta(payload));
    logger.info(`TicketMinted: token ${tokenId} (type ${typeId}) minted for event ${eventId} to ${to}`);
  },

  // TicketPurchased — paid tickets only: the price paid and the type's sold count (#215)
  TicketPurchased: async (tokenId: bigint, _eventId: bigint, _typeId: bigint, _buyer: string, price: bigint) => {
    await recordPurchase(tokenId, price);
    logger.info(`TicketPurchased: token ${tokenId} sold for ${price}`);
  },

  // TicketCheckedIn — mark ticket as USED and log the check-in
  TicketCheckedIn: async (tokenId: bigint, scanner: string) => {
    // Only a VALID ticket can be checked in. If the same event arrives twice
    // (e.g. after a listener restart), the ticket is already USED and nothing
    // changes, so used_at isn't overwritten and no second log row is added.
    const { count } = await prisma.ticket.updateMany({
      where: { token_id: tokenId, status: 'VALID' },
      data: { status: 'USED', used_at: new Date() },
    });

    if (count === 0) {
      logger.info(`TicketCheckedIn: token ${tokenId} is unknown or already used, skipping`);
      return;
    }

    await prisma.checkinLog.create({
      data: {
        token_id: tokenId,
        scanner_wallet: scanner.toLowerCase(),
      },
    });

    logger.info(`TicketCheckedIn: token ${tokenId} checked in by ${scanner}`);
  },

  // EventConfigured — the event's rules, from the organizer's setup or an admin's change (#299)
  EventConfigured: async (eventId: bigint, organizer: string, endTime: bigint, royaltyBps: bigint, resaleCapBps: bigint, perWalletLimit: bigint) => {
    await applyEventSettings(eventId, { organizer, endTime, royaltyBps, resaleCapBps, perWalletLimit });
    logger.info(`EventConfigured: settings saved for event ${eventId}`);
  },

  // TicketTypeConfigured — link the on-chain type ID and copy its price and supply (#215, #216)
  TicketTypeConfigured: async (eventId: bigint, typeId: bigint, price: bigint, maxSupply: bigint, metadataURI: string) => {
    await applyTicketType(eventId, typeId, price, maxSupply, metadataURI);
    logger.info(`TicketTypeConfigured: type ${typeId} of event ${eventId} saved`);
  },

  // SaleStatusUpdated and PresaleStatusUpdated — the organizer's sale toggles (#215)
  SaleStatusUpdated: async (eventId: bigint, active: boolean) => {
    await setSaleActive(eventId, active);
    logger.info(`SaleStatusUpdated: event ${eventId} sale ${active ? 'open' : 'paused'}`);
  },

  PresaleStatusUpdated: async (eventId: bigint, active: boolean) => {
    await setPresaleActive(eventId, active);
    logger.info(`PresaleStatusUpdated: event ${eventId} presale ${active ? 'on' : 'off'}`);
  },

  // RevenueWithdrawn — record the organizer's withdrawal (#215)
  RevenueWithdrawn: async (eventId: bigint, organizer: string, amount: bigint, payload?: LogPayload) => {
    await recordWithdrawal(eventId, organizer, amount, await logMeta(payload));
    logger.info(`RevenueWithdrawn: ${amount} withdrawn from event ${eventId} by ${organizer}`);
  },

  // TicketListed, ListingCancelled and TicketResold — resale listings (#299)
  TicketListed: async (tokenId: bigint, seller: string, price: bigint, payload?: LogPayload) => {
    await recordListing(tokenId, seller, price, await logMeta(payload));
    logger.info(`TicketListed: token ${tokenId} listed by ${seller} for ${price}`);
  },

  ListingCancelled: async (tokenId: bigint) => {
    await removeListing(tokenId);
    logger.info(`ListingCancelled: token ${tokenId} is no longer listed`);
  },

  TicketResold: async (tokenId: bigint, _from: string, to: string, price: bigint) => {
    await recordResale(tokenId, to);
    logger.info(`TicketResold: token ${tokenId} resold to ${to} for ${price}`);
  },

  // WhitelistUpdated — sync or remove whitelist entry based on status bool
  WhitelistUpdated: async (eventId: bigint, wallet: string, status: boolean) => {
    const event = await prisma.event.findFirst({
      where: { contract_event_id: eventId },
    });

    if (!event) return;

    if (status) {
      await prisma.whitelist.updateMany({
        where: { event_id: event.id, wallet: wallet.toLowerCase() },
        data: { synced_to_chain: true },
      });
      logger.info(`WhitelistUpdated: wallet ${wallet} synced for event ${event.id}`);
    } else {
      await prisma.whitelist.deleteMany({
        where: { event_id: event.id, wallet: wallet.toLowerCase() },
      });
      logger.info(`WhitelistUpdated: wallet ${wallet} removed from event ${event.id}`);
    }
  },

  // ScannerUpdated — sync or remove scanner entry based on status bool
  ScannerUpdated: async (eventId: bigint, wallet: string, status: boolean) => {
    const event = await prisma.event.findFirst({
      where: { contract_event_id: eventId },
    });

    if (!event) return;

    if (status) {
      await prisma.scanner.updateMany({
        where: { event_id: event.id, wallet: wallet.toLowerCase() },
        data: { synced_to_chain: true },
      });
      logger.info(`ScannerUpdated: wallet ${wallet} synced for event ${event.id}`);
    } else {
      await prisma.scanner.deleteMany({
        where: { event_id: event.id, wallet: wallet.toLowerCase() },
      });
      logger.info(`ScannerUpdated: wallet ${wallet} removed from event ${event.id}`);
    }
  },
};

export const SYNCED_EVENTS = Object.keys(HANDLERS);

// How often the listener asks the node for new blocks
export const POLL_INTERVAL_MS = 4_000;
// Blocks per eth_getLogs request: hosted RPCs cap the range of one request (Pinax: 1,000, #219)
export const MAX_BLOCK_RANGE = 1_000;

// Runs one contract event through its handler. Events the database doesn't keep are ignored, and a
// failing handler is logged without stopping the events after it.
export async function handleEvent(eventName: string, args: readonly unknown[], log?: ethers.Log): Promise<void> {
  const handler = HANDLERS[eventName];
  if (!handler) return;
  try {
    await handler(...args, log ? { log } : undefined);
  } catch (err) {
    logger.error(`${eventName} handler error`, { error: err });
  }
}

// Reads the contract's logs block by block with eth_getLogs and handles them one at a time, in the
// order they happened. A purchase emits TicketMinted then TicketPurchased, and the second needs the
// first saved; a listing made then transferred away must end up removed.
//
// This replaces ethers' contract.on(): its subscription uses a filter kept by the node, which ethers
// only reads when a new block arrives. After 5 minutes without a block the node drops the filter;
// ethers then logs "@TODO TypeError: results is not iterable" on every block and never sees another
// event. getLogs keeps nothing on the node, so a quiet chain can't break it.
export function createLogPoller(provider: ethers.Provider, address: string) {
  const iface = new ethers.Interface(TICKET_NFT_ABI);
  let nextBlock: number | null = null;
  let running: Promise<void> | null = null;

  // Start with the next block: events from before the API started are a backfill (#119)
  async function start(): Promise<void> {
    nextBlock = (await provider.getBlockNumber()) + 1;
  }

  async function poll(): Promise<void> {
    const head = await provider.getBlockNumber();
    if (nextBlock === null) nextBlock = head + 1;

    // The node is behind what was already read: it's a new chain (a restarted local node)
    if (head < nextBlock - 1) {
      logger.warn(`Blockchain listener: the chain restarted (block ${head}), reading it again from block 0`);
      nextBlock = 0;
    }

    while (nextBlock <= head) {
      const toBlock = Math.min(head, nextBlock + MAX_BLOCK_RANGE - 1);
      const logs = await provider.getLogs({ address, fromBlock: nextBlock, toBlock });
      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      for (const log of logs) {
        let parsed: ethers.LogDescription | null = null;
        try {
          parsed = iface.parseLog(log);
        } catch {
          // Not one of TicketNFT's events (e.g. from an older version of the contract)
        }
        if (parsed) await handleEvent(parsed.name, [...parsed.args], log);
      }
      // Only move on once the whole range is handled, so a failed request is read again next time
      nextBlock = toBlock + 1;
    }
  }

  return {
    start,
    // One poll at a time: a slow one makes the next wait instead of reading the same blocks twice
    poll: () => (running ??= poll().finally(() => (running = null))),
  };
}

export async function startBlockchainListener(): Promise<void> {
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    logger.warn('Blockchain listener not started: RPC_URL or CONTRACT_ADDRESS is missing from environment.');
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const poller = createLogPoller(provider, contractAddress);
  await poller.start();

  logger.info(`Blockchain listener connected to contract ${contractAddress}`);

  const tick = async () => {
    try {
      await poller.poll();
    } catch (err) {
      logger.error('Blockchain listener: could not read new events, trying again', { error: err });
    } finally {
      setTimeout(tick, POLL_INTERVAL_MS);
    }
  };
  setTimeout(tick, POLL_INTERVAL_MS);
}
