import { EventStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function getTicketsByWallet(walletAddress: string) {
  return prisma.ticket.findMany({
    where: { owner_wallet: walletAddress.toLowerCase() },
    include: { event: true, ticket_type: true },
    orderBy: { minted_at: 'desc' },
  });
}

export async function getTicketByTokenId(tokenId: bigint) {
  return prisma.ticket.findUnique({
    where: { token_id: tokenId },
    include: { event: true, ticket_type: true },
  });
}

export async function validateTicket(tokenId: bigint, eventId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { token_id: tokenId },
    include: { event: true },
  });

  if (!ticket) return { valid: false, reason: 'Ticket not found' };
  if (ticket.event_id !== eventId) return { valid: false, reason: 'Ticket does not belong to this event' };
  if (ticket.status === 'USED') return { valid: false, reason: 'Ticket already used', used_at: ticket.used_at };

  return { valid: true, ticket };
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
