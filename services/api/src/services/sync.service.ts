import { ethers } from 'ethers';
import { Event } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { fromUnixSeconds, ipfsHashFromUri, isChainConfigured, readOnlyContract, toUsdc } from '../lib/ticketNft';

// Copies TicketNFT's state into the database (#113). The contract is the source of truth: these
// functions only ever write what the chain says, and every one of them is safe to run twice for the
// same on-chain event, so a replayed or repeated event never double counts.

// Where an on-chain event came from: used to date rows and to recognize an event seen twice
export interface LogMeta {
  txHash: string | null;
  logIndex: number | null;
  blockTime: Date;
}

export interface EventSettings {
  organizer: string;
  endTime: bigint;
  royaltyBps: bigint;
  resaleCapBps: bigint;
  perWalletLimit: bigint;
}

const lower = (address: string) => address.toLowerCase();

// Events are created in the API first and only get their contract ID when they're published.
// Anything the contract emits for an event the API hasn't linked yet is copied at publish time
// instead (syncEventFromChain).
async function findEvent(contractEventId: bigint): Promise<Event | null> {
  return prisma.event.findUnique({ where: { contract_event_id: contractEventId } });
}

// --- Event setup -------------------------------------------------------------------------------

// EventConfigured: the organizer's setup, or an admin's later change (#293)
export async function applyEventSettings(contractEventId: bigint, settings: EventSettings): Promise<void> {
  const event = await findEvent(contractEventId);
  if (!event) {
    logger.debug(`EventConfigured: event ${contractEventId} isn't published in the API yet, it's copied at publish`);
    return;
  }
  await saveEventSettings(event, settings);
}

async function saveEventSettings(event: Event, settings: EventSettings): Promise<void> {
  if (lower(settings.organizer) !== event.organizer_wallet) {
    logger.warn(
      `EventConfigured: event ${event.id} is organized by ${event.organizer_wallet} in the API but by ${lower(settings.organizer)} on-chain`
    );
  }
  await prisma.event.update({
    where: { id: event.id },
    data: {
      royalty_bps: Number(settings.royaltyBps),
      resale_cap_bps: Number(settings.resaleCapBps),
      per_wallet_limit: Number(settings.perWalletLimit),
      sales_end_at: fromUnixSeconds(settings.endTime),
    },
  });
}

export async function setSaleActive(contractEventId: bigint, active: boolean): Promise<void> {
  const { count } = await prisma.event.updateMany({ where: { contract_event_id: contractEventId }, data: { sale_active: active } });
  if (count === 0) logger.debug(`SaleStatusUpdated: event ${contractEventId} isn't published in the API yet`);
}

export async function setPresaleActive(contractEventId: bigint, active: boolean): Promise<void> {
  const { count } = await prisma.event.updateMany({ where: { contract_event_id: contractEventId }, data: { presale_active: active } });
  if (count === 0) logger.debug(`PresaleStatusUpdated: event ${contractEventId} isn't published in the API yet`);
}

// TicketTypeConfigured: links the on-chain type ID to the API's ticket type (#216) and copies its
// price and supply (#215).
export async function applyTicketType(
  contractEventId: bigint,
  typeId: bigint,
  price: bigint,
  maxSupply: bigint,
  metadataURI: string
): Promise<void> {
  const event = await findEvent(contractEventId);
  if (!event) {
    logger.debug(`TicketTypeConfigured: event ${contractEventId} isn't published in the API yet, it's copied at publish`);
    return;
  }
  await linkTicketType(event, Number(typeId), price, maxSupply, metadataURI);
}

// The API type is the one already linked to this type ID, or else the unlinked one whose frozen
// metadata the contract points to (ipfs://<ipfs_hash>). Never guessed from order.
async function linkTicketType(event: Event, typeId: number, price: bigint, maxSupply: bigint, metadataURI: string): Promise<void> {
  const linked = await prisma.ticketType.findUnique({
    where: { event_id_contract_type_id: { event_id: event.id, contract_type_id: typeId } },
  });
  const hash = ipfsHashFromUri(metadataURI);
  const ticketType =
    linked ??
    (hash
      ? await prisma.ticketType.findFirst({
          where: { event_id: event.id, contract_type_id: null, ipfs_hash: hash },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        })
      : null);

  if (!ticketType) {
    logger.warn(`TicketTypeConfigured: no ticket type of event ${event.id} matches type ${typeId} (${metadataURI}), skipping`);
    return;
  }

  await prisma.ticketType.update({
    where: { id: ticketType.id },
    data: { contract_type_id: typeId, price: toUsdc(price), supply: Number(maxSupply) },
  });
}

// --- Tickets -----------------------------------------------------------------------------------

// sold counts paid tickets (#215), recounted from the tickets so a replayed purchase can't add twice.
// One statement, so two purchases recorded at the same time can't overwrite each other's count.
async function recountSold(ticketTypeId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "TicketType"
    SET sold = (SELECT count(*)::int FROM "Ticket" WHERE ticket_type_id = ${ticketTypeId} AND purchase_price IS NOT NULL),
        updated_at = now()
    WHERE id = ${ticketTypeId}`;
}

// TicketMinted: every new ticket, bought or issued by the organizer
export async function recordMint(
  tokenId: bigint,
  contractEventId: bigint,
  typeId: bigint,
  to: string,
  meta: LogMeta
): Promise<void> {
  const event = await findEvent(contractEventId);
  if (!event) {
    logger.warn(`TicketMinted: no event found for contract_event_id ${contractEventId}, skipping token ${tokenId}`);
    return;
  }

  const ticketType = await prisma.ticketType.findUnique({
    where: { event_id_contract_type_id: { event_id: event.id, contract_type_id: Number(typeId) } },
  });
  if (!ticketType) {
    // Don't fall back to another type: a wrong type is worse than a ticket the backfill adds later (#216)
    logger.warn(`TicketMinted: event ${event.id} has no ticket type with contract_type_id ${typeId}, skipping token ${tokenId}`);
    return;
  }

  const existing = await prisma.ticket.findUnique({ where: { token_id: tokenId } });
  const base = { event_id: event.id, ticket_type_id: ticketType.id };

  if (!existing) {
    await prisma.ticket.create({
      data: {
        token_id: tokenId,
        ...base,
        owner_wallet: lower(to),
        face_value: ticketType.price, // TicketPurchased replaces it with the price paid
        mint_tx_hash: meta.txHash,
        minted_at: meta.blockTime,
      },
    });
  } else if (existing.mint_tx_hash && meta.txHash && existing.mint_tx_hash !== meta.txHash) {
    // The same token ID minted by a different transaction: the chain was reset (local development),
    // so nothing about the old row applies anymore
    await prisma.$transaction([
      prisma.listing.deleteMany({ where: { token_id: tokenId } }),
      prisma.ticket.update({
        where: { token_id: tokenId },
        data: {
          ...base,
          owner_wallet: lower(to),
          status: 'VALID',
          used_at: null,
          face_value: ticketType.price,
          purchase_price: null,
          mint_tx_hash: meta.txHash,
          minted_at: meta.blockTime,
        },
      }),
    ]);
    if (existing.ticket_type_id !== ticketType.id) await recountSold(existing.ticket_type_id);
  } else {
    // The same mint seen again (a restart or replay). Fix the event and type, which older rows may
    // have wrong, but keep the owner and check-in: later events already moved them on.
    await prisma.ticket.update({
      where: { token_id: tokenId },
      data: { ...base, mint_tx_hash: existing.mint_tx_hash ?? meta.txHash },
    });
    if (existing.ticket_type_id !== ticketType.id) await recountSold(existing.ticket_type_id);
  }

  await recountSold(ticketType.id);
}

// TicketPurchased: emitted right after TicketMinted for paid tickets only, so organizer-issued
// tickets never count as sales (#215)
export async function recordPurchase(tokenId: bigint, price: bigint): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { token_id: tokenId } });
  if (!ticket) {
    logger.warn(`TicketPurchased: token ${tokenId} wasn't saved by TicketMinted, skipping`);
    return;
  }
  const paid = toUsdc(price);
  await prisma.ticket.update({ where: { token_id: tokenId }, data: { purchase_price: paid, face_value: paid } });
  await recountSold(ticket.ticket_type_id);
}

// Transfer: any change of owner. The contract also ends the ticket's listing on every transfer,
// without a ListingCancelled event, so the listing goes here too.
export async function recordTransfer(tokenId: bigint, to: string): Promise<void> {
  await prisma.$transaction([
    prisma.ticket.updateMany({ where: { token_id: tokenId }, data: { owner_wallet: lower(to) } }),
    prisma.listing.deleteMany({ where: { token_id: tokenId } }),
  ]);
}

// --- Revenue -----------------------------------------------------------------------------------

export async function recordWithdrawal(contractEventId: bigint, organizer: string, amount: bigint, meta: LogMeta): Promise<void> {
  const event = await findEvent(contractEventId);
  if (!event) {
    logger.warn(`RevenueWithdrawn: no event found for contract_event_id ${contractEventId}, skipping`);
    return;
  }

  const data = {
    event_id: event.id,
    organizer_wallet: lower(organizer),
    amount: toUsdc(amount),
    withdrawn_at: meta.blockTime,
    tx_hash: meta.txHash,
    log_index: meta.logIndex,
  };

  if (meta.txHash !== null && meta.logIndex !== null) {
    await prisma.withdrawal.upsert({
      where: { tx_hash_log_index: { tx_hash: meta.txHash, log_index: meta.logIndex } },
      update: {},
      create: data,
    });
  } else {
    await prisma.withdrawal.create({ data });
  }
}

// --- Resale (#299) -----------------------------------------------------------------------------

// TicketListed: a new listing, or a new price for an existing one
export async function recordListing(tokenId: bigint, seller: string, price: bigint, meta: LogMeta): Promise<void> {
  const ticket = await prisma.ticket.findUnique({ where: { token_id: tokenId } });
  if (!ticket) {
    logger.warn(`TicketListed: token ${tokenId} isn't in the database, skipping`);
    return;
  }
  const data = { seller_wallet: lower(seller), price: toUsdc(price), listed_at: meta.blockTime, tx_hash: meta.txHash };
  await prisma.listing.upsert({ where: { token_id: tokenId }, update: data, create: { token_id: tokenId, ...data } });
}

// ListingCancelled: the seller cancelled, or the ticket was checked in
export async function removeListing(tokenId: bigint): Promise<void> {
  await prisma.listing.deleteMany({ where: { token_id: tokenId } });
}

// TicketResold: the buyer now owns the ticket and the listing is over. The Transfer before it
// already did both; doing it here too keeps the result right if only one of them is seen.
export async function recordResale(tokenId: bigint, to: string): Promise<void> {
  await recordTransfer(tokenId, to);
}

// --- Publish -----------------------------------------------------------------------------------

export type SyncResult = 'synced' | 'skipped' | 'not_on_chain';

// Copies an event's on-chain setup into the database. Organizers configure the event, add its
// ticket types and open sales before the API knows its contract ID (see the create event flow), so
// the listener has nothing to attach those events to. This runs once the event is published, reads
// what the contract has now and links the ticket types by their frozen metadata.
export async function syncEventFromChain(eventId: string, provider?: ethers.Provider): Promise<SyncResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.contract_event_id === null) return 'skipped';
  if (!provider && !isChainConfigured()) return 'skipped';

  const ownProvider = provider ? null : new ethers.JsonRpcProvider(process.env.RPC_URL);
  try {
    const contract = readOnlyContract((provider ?? ownProvider)!);
    const id = event.contract_event_id;
    const [organizer, config, royaltyBps, presale] = await Promise.all([
      contract.eventOrganizer(id) as Promise<string>,
      contract.eventConfigs(id),
      contract.royaltyPercentage(id) as Promise<bigint>,
      contract.presaleActive(id) as Promise<boolean>,
    ]);
    if (!config.configured) {
      logger.warn(`Publish: event ${event.id} (contract event ${id}) isn't configured on-chain`);
      return 'not_on_chain';
    }

    await saveEventSettings(event, {
      organizer,
      endTime: config.endTime,
      royaltyBps,
      resaleCapBps: config.resaleCapBps,
      perWalletLimit: config.perWalletLimit,
    });
    await prisma.event.update({ where: { id: event.id }, data: { sale_active: config.active, presale_active: presale } });

    for (let typeId = 0; typeId < Number(config.ticketTypeCount); typeId++) {
      const type = await contract.ticketTypes(id, typeId);
      await linkTicketType(event, typeId, type.price, type.maxSupply, type.metadataURI);
    }
    return 'synced';
  } finally {
    ownProvider?.destroy();
  }
}
