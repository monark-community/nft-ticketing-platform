import { EventStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function getTicketsByWallet(walletAddress: string) {
  return prisma.ticket.findMany({
    where: { owner_wallet: walletAddress.toLowerCase() },
    include: { event: true, ticket_type: true },
    orderBy: { minted_at: 'desc' },
  });
}

// GET /api/tickets/owner/:address (#219): the tickets a wallet holds, for My Tickets. Ownership is
// public on-chain, so this needs no sign-in. The listener keeps owners in line with the contract.
export async function getTicketsByOwner(walletAddress: string) {
  const tickets = await prisma.ticket.findMany({
    where: { owner_wallet: walletAddress.toLowerCase() },
    include: { event: true, ticket_type: true, listing: true },
    orderBy: [{ minted_at: 'desc' }, { token_id: 'asc' }],
  });

  return tickets.map(({ event, ticket_type: type, listing, ...ticket }) => ({
    token_id: ticket.token_id,
    owner_wallet: ticket.owner_wallet,
    status: ticket.status,
    used_at: ticket.used_at,
    minted_at: ticket.minted_at,
    face_value: ticket.face_value,
    purchase_price: ticket.purchase_price,
    // The resale price when the ticket is listed
    listing_price: listing?.price ?? null,
    event: {
      id: event.id,
      contract_event_id: event.contract_event_id,
      title: event.title,
      location: event.location,
      category: event.category,
      start_date: event.start_date,
      end_date: event.end_date,
      image_url: event.image_url,
      // Resale terms, copied from the contract (#299): for selling on the Marketplace (#295)
      resale_cap_bps: event.resale_cap_bps,
      royalty_bps: event.royalty_bps,
      sales_end_at: event.sales_end_at,
    },
    ticket_type: { id: type.id, name: type.name, contract_type_id: type.contract_type_id },
  }));
}

export async function getTicketByTokenId(tokenId: bigint) {
  return prisma.ticket.findUnique({
    where: { token_id: tokenId },
    include: { event: true, ticket_type: true },
  });
}

export async function listTicketTypesForEvent(eventId: string) {
  return prisma.ticketType.findMany({
    where: { event_id: eventId },
    orderBy: { price: 'asc' },
  });
}

export async function createTicketType(
  eventId: string,
  organizerWallet: string,
  data: {
    name: string;
    description?: string;
    price: number;
    supply: number;
    metadata?: Record<string, unknown>;
  }
) {
  // #213: only the event's organizer may add ticket types, and only while DRAFT.
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';
  if (event.status !== EventStatus.DRAFT) return 'frozen';

  return prisma.ticketType.create({
    data: {
      event_id: eventId,
      name: data.name,
      description: data.description,
      price: data.price,
      supply: data.supply,
      metadata: data.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

// The create event flow (#187) lets organizers remove a ticket type while the event is a draft.
// Once frozen, the types are pinned to IPFS and go on-chain, so they can't be removed.
export async function deleteTicketType(id: string, organizerWallet: string) {
  const ticketType = await prisma.ticketType.findUnique({
    where: { id },
    include: { event: true },
  });

  if (!ticketType) return null;
  if (ticketType.event.organizer_wallet !== organizerWallet) return 'forbidden';
  if (ticketType.event.status !== EventStatus.DRAFT) return 'frozen';

  await prisma.ticketType.delete({ where: { id } });
  return 'deleted';
}

export async function updateTicketType(
  id: string,
  organizerWallet: string,
  data: { name?: string; description?: string; price?: number; supply?: number }
) {
  const ticketType = await prisma.ticketType.findUnique({
    where: { id },
    include: { event: true },
  });

  if (!ticketType) return null;
  if (ticketType.event.organizer_wallet !== organizerWallet) return 'forbidden';
  // #212: ticket types lock once the event leaves DRAFT.
  if (ticketType.event.status !== EventStatus.DRAFT) return 'frozen';

  // #212: defense in depth — only these fields may change here, even if a
  // caller passes sold or event_id.
  const { name, description, price, supply } = data;
  return prisma.ticketType.update({ where: { id }, data: { name, description, price, supply } });
}
