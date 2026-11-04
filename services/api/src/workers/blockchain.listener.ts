import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';
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

  // TicketCheckedIn — mark ticket as USED and log the check-in (#117)
  TicketCheckedIn: async (tokenId: bigint, scanner: string, payload?: LogPayload) => {
    // Dated by the check-in's block, like the other rows, not by when the listener saw it
    const { blockTime: checkedInAt } = await logMeta(payload);
    const scannerWallet = scanner.toLowerCase();

    // Only a VALID ticket can be checked in. If the same event arrives twice
    // (e.g. after a listener restart), the ticket is already USED and nothing
    // changes, so used_at isn't overwritten and no second log row is added.
    // One transaction, so a ticket is never USED without its log row.
    const checkedIn = await prisma.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { token_id: tokenId, status: 'VALID' },
        data: { status: 'USED', used_at: checkedInAt },
      });
      if (count === 0) return false;

      // The contract lets any wallet with the scanner role check in, including one that never
      // signed in to the app. The log needs a user row for it, so add an empty one (the same as
      // signing in creates); it fills in if that wallet signs in later.
      await tx.user.upsert({ where: { wallet_address: scannerWallet }, update: {}, create: { wallet_address: scannerWallet } });
      await tx.checkinLog.create({
        data: { token_id: tokenId, scanner_wallet: scannerWallet, checked_in_at: checkedInAt },
      });
      return true;
    });

    if (!checkedIn) {
      logger.info(`TicketCheckedIn: token ${tokenId} is unknown or already used, skipping`);
      return;
    }
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
// Blocks per eth_getLogs request. Hosted RPCs limit what one request can cover (Pinax: 100,000
// blocks or 20,000 results; PublicNode: 50,000 blocks), and 1,000 stays well under that. A request
// that's still too big is split in half until it fits (#219).
export const MAX_BLOCK_RANGE = 1_000;
// After a restart, read the last few blocks again in case a reorg replaced them. Every handler is
// safe to run twice for the same event.
export const REORG_OVERLAP = 5;
// When the RPC says "too many requests", wait 1, 2, 4 then 8 s before asking again. After that the
// poll gives up, and the next one reads the same blocks again.
export const RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_FIRST_WAIT_MS = 1_000;
// Local development chains (Hardhat, Anvil, Ganache): the only chains that can start over
const LOCAL_CHAIN_IDS = new Set([31337n, 1337n]);

// The RPC's own error message: ethers wraps it ("could not coalesce error (error={ ... })")
function rpcErrorText(err: unknown): string {
  const e = err as { error?: { message?: unknown }; shortMessage?: unknown; message?: unknown } | null;
  return [e?.error?.message, e?.shortMessage, e?.message].filter((part) => typeof part === 'string').join(' ');
}

export function isRateLimited(err: unknown): boolean {
  const code = (err as { error?: { code?: unknown } } | null)?.error?.code;
  return code === 429 || /rate.?limit|too many requests|throttl|\b429\b/i.test(rpcErrorText(err));
}

// "query exceeds max block range 100000", "exceed maximum block range: 50000",
// "query exceeds max results 20000", "query returned more than 10000 results", ...
export function isRangeTooLarge(err: unknown): boolean {
  return !isRateLimited(err) && /range|max results|more than \d+ results|too many (results|logs|blocks)|response size|exceed/i.test(rpcErrorText(err));
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface LogPollerOptions {
  // The block the contract was deployed in (CONTRACT_DEPLOY_BLOCK): nothing before it is read
  deployBlock?: number | null;
  // How the poller waits after a rate limit (tests replace it)
  sleep?: (ms: number) => Promise<void>;
}

// Prisma's errors for a database it can't reach: can't connect (P1001), connection timed out (P1002),
// operation timed out (P1008), connection closed (P1017), no free connection in the pool (P2024)
const DATABASE_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

export function isDatabaseUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  return err instanceof Prisma.PrismaClientKnownRequestError && DATABASE_UNAVAILABLE_CODES.has(err.code);
}

// Runs one contract event through its handler. Events the database doesn't keep are ignored.
// A handler that fails because of the event itself is logged without stopping the events after it,
// so one bad event can't hold up the listener. When the database can't be reached, the error goes
// up instead: the poller then reads the same blocks again, rather than move past an event it
// couldn't save (every handler is safe to run twice).
export async function handleEvent(eventName: string, args: readonly unknown[], log?: ethers.Log): Promise<void> {
  const handler = HANDLERS[eventName];
  if (!handler) return;
  try {
    await handler(...args, log ? { log } : undefined);
  } catch (err) {
    if (isDatabaseUnavailable(err)) throw err;
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
//
// The last block read is saved in SyncState, so events from while the API was down are read when it
// starts again (#119). The blocks are read in order, one request at a time.
export function createLogPoller(provider: ethers.Provider, address: string, options: LogPollerOptions = {}) {
  const iface = new ethers.Interface(TICKET_NFT_ABI);
  const sleep = options.sleep ?? wait;
  const deployBlock = options.deployBlock ?? null;
  let nextBlock: number | null = null;
  let firstBlock = 0; // where reading the whole chain starts
  let localChain = false;
  let cursorId = '';
  let running: Promise<void> | null = null;

  // Where to start: after the last block saved, or else at the contract's deploy block
  async function start(): Promise<void> {
    const [network, head] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
    localChain = LOCAL_CHAIN_IDS.has(network.chainId);
    firstBlock = deployBlock ?? 0;
    // A new deploy, or the same address on another chain, starts its own row
    cursorId = `${network.chainId}:${address.toLowerCase()}`;

    // A local chain is read again from the start every time: npm run dev:fresh starts a new chain
    // at the same contract address, so a saved block may belong to the old one
    const saved = localChain ? null : await prisma.syncState.findUnique({ where: { id: cursorId } });

    let from: number;
    if (saved) {
      from = Math.max(firstBlock, saved.last_block + 1 - REORG_OVERLAP);
    } else if (deployBlock !== null || localChain) {
      from = firstBlock;
    } else {
      logger.warn(
        'Blockchain listener: CONTRACT_DEPLOY_BLOCK is not set, so events from before now are not read. ' +
          'Set it to the block the contract was deployed in (deployBlock in addresses.json).'
      );
      from = head + 1;
    }
    nextBlock = from;
    if (from <= head) logger.info(`Blockchain listener: reading blocks ${from} to ${head}, then new blocks as they come`);
  }

  // One window, asking again after a rate limit
  async function getLogs(fromBlock: number, toBlock: number): Promise<ethers.Log[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await provider.getLogs({ address, fromBlock, toBlock });
      } catch (err) {
        if (!isRateLimited(err) || attempt >= RATE_LIMIT_RETRIES) throw err;
        const delay = RATE_LIMIT_FIRST_WAIT_MS * 2 ** attempt;
        logger.warn(`Blockchain listener: the RPC is rate limiting, asking again in ${delay / 1000} s`);
        await sleep(delay);
      }
    }
  }

  async function poll(): Promise<void> {
    // The node couldn't be reached when the API started: start now, and read the blocks next time
    if (nextBlock === null) {
      await start();
      return;
    }
    const head = await provider.getBlockNumber();

    // The node reports an earlier block than the ones already read
    if (head < nextBlock - 1) {
      if (!localChain) {
        // On Sepolia this is a node behind its peers (hosted RPCs balance requests across several
        // nodes), or a saved block the node hasn't reached yet. The chain didn't go anywhere: wait
        // for that node to catch up.
        logger.debug(`Blockchain listener: the node is at block ${head}, behind block ${nextBlock - 1} already read; waiting`);
        return;
      }
      // Only a local node can start over (npm run dev:fresh): read the new chain from the start
      logger.warn(`Blockchain listener: the local chain restarted (block ${head}), reading it again from block ${firstBlock}`);
      nextBlock = firstBlock;
    }

    let span = MAX_BLOCK_RANGE;
    while (nextBlock <= head) {
      const toBlock = Math.min(head, nextBlock + span - 1);
      let logs: ethers.Log[];
      try {
        logs = await getLogs(nextBlock, toBlock);
      } catch (err) {
        // The RPC won't return that many blocks or results at once: try half as many
        if (isRangeTooLarge(err) && toBlock > nextBlock) {
          span = Math.ceil((toBlock - nextBlock + 1) / 2);
          logger.warn(`Blockchain listener: blocks ${nextBlock} to ${toBlock} are too many for one request, reading ${span} at a time`);
          continue;
        }
        throw err;
      }
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

      // Only move on once the whole range is handled and saved, so a failed request or save is
      // read again next time
      await prisma.syncState.upsert({
        where: { id: cursorId },
        update: { last_block: toBlock },
        create: { id: cursorId, last_block: toBlock },
      });
      nextBlock = toBlock + 1;
    }
  }

  return {
    start,
    started: () => nextBlock !== null,
    // One poll at a time: a slow one makes the next wait instead of reading the same blocks twice
    poll: () => (running ??= poll().finally(() => (running = null))),
  };
}

// CONTRACT_DEPLOY_BLOCK: where reading the chain starts the first time (#242)
export function deployBlockFromEnv(value = process.env.CONTRACT_DEPLOY_BLOCK): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    logger.warn(`CONTRACT_DEPLOY_BLOCK must be a block number, ignoring "${raw}"`);
    return null;
  }
  return Number(raw);
}

export async function startBlockchainListener(): Promise<void> {
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    logger.warn('Blockchain listener not started: RPC_URL or CONTRACT_ADDRESS is missing from environment.');
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const poller = createLogPoller(provider, contractAddress, { deployBlock: deployBlockFromEnv() });
  const connected = () => logger.info(`Blockchain listener connected to contract ${contractAddress}`);

  // An unreachable node (or database) must not stop the API: the pages that read the database keep
  // working, and the listener keeps trying every few seconds until it can start.
  try {
    await poller.start();
    connected();
  } catch (err) {
    logger.error(`Blockchain listener: cannot start (is the node at RPC_URL reachable?), trying again every ${POLL_INTERVAL_MS / 1000} s`, { error: err });
  }

  const tick = async () => {
    const wasStarted = poller.started();
    try {
      await poller.poll();
      if (!wasStarted) connected();
    } catch (err) {
      const message = wasStarted ? 'could not read or save new events' : 'still cannot start';
      logger.error(`Blockchain listener: ${message}, trying again`, { error: err });
    } finally {
      setTimeout(tick, POLL_INTERVAL_MS);
    }
  };
  setTimeout(tick, POLL_INTERVAL_MS);
}
