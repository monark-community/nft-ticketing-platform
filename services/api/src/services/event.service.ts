import { EventStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

// An event is over once its end date has passed. Without an end date it counts as over
// 12 hours after it starts, the same rule My Tickets uses (#310), so both pages agree.
export const NO_END_DATE_GRACE_MS = 12 * 60 * 60 * 1000;

export function notEndedFilter(now: Date = new Date()) {
  return {
    OR: [
      { end_date: { gte: now } },
      { end_date: null, start_date: { gte: new Date(now.getTime() - NO_END_DATE_GRACE_MS) } },
    ],
  };
}

// Published events, upcoming and in progress by default (#283).
// includePast lists every published event, for My Tickets to show past tickets' details (#310).
export async function listEvents(page: number, limit: number, includePast = false) {
  const skip = (page - 1) * limit;
  const where = { status: EventStatus.PUBLISHED, ...(includePast ? {} : notEndedFilter()) };
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip,
      take: limit,
      orderBy: { start_date: 'asc' },
      include: { ticket_types: true },
    }),
    prisma.event.count({ where }),
  ]);
  return { events, total, page, limit };
}

export async function getEventById(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: { ticket_types: true },
  });
}

export async function createEvent(
  organizerWallet: string,
  data: {
    title: string;
    description?: string;
    location?: string;
    category?: string;
    start_date: string;
    end_date?: string;
    image_url?: string;
  }
) {
  return prisma.event.create({
    data: {
      organizer_wallet: organizerWallet,
      title: data.title,
      description: data.description,
      location: data.location,
      category: data.category,
      start_date: new Date(data.start_date),
      end_date: data.end_date ? new Date(data.end_date) : undefined,
      image_url: data.image_url,
      status: EventStatus.DRAFT,
    },
  });
}

export async function updateEvent(
  id: string,
  organizerWallet: string,
  data: {
    title?: string;
    description?: string;
    location?: string;
    category?: string;
    start_date?: string;
    end_date?: string;
    image_url?: string;
  }
) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';
  if (event.status !== EventStatus.DRAFT) return 'frozen';

  // #211: defense in depth — only these fields may change here, even if a
  // caller passes status, organizer_wallet, contract_event_id or ipfs_hash.
  const { title, description, location, category, start_date, end_date, image_url } = data;
  return prisma.event.update({
    where: { id },
    data: {
      title,
      description,
      location,
      category,
      start_date: start_date ? new Date(start_date) : undefined,
      end_date: end_date ? new Date(end_date) : undefined,
      image_url,
    },
  });
}

export async function freezeEvent(
  id: string,
  organizerWallet: string,
  ipfsHash: string,
  ticketPins: Array<{ id: string; ipfsHash: string }> = []
) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { ticket_types: true },
  });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';
  if (event.status !== EventStatus.DRAFT) return 'already_frozen';

  const ticketIds = new Set(event.ticket_types.map((t) => t.id));
  for (const pin of ticketPins) {
    if (!ticketIds.has(pin.id)) return 'invalid_ticket_type';
  }

  await prisma.$transaction([
    prisma.event.update({
      where: { id },
      data: { ipfs_hash: ipfsHash, status: EventStatus.FROZEN },
    }),
    ...ticketPins.map((pin) =>
      prisma.ticketType.update({
        where: { id: pin.id },
        data: { ipfs_hash: pin.ipfsHash },
      })
    ),
  ]);

  return prisma.event.findUnique({
    where: { id },
    include: { ticket_types: true },
  });
}

export async function publishEvent(
  id: string,
  organizerWallet: string,
  contractEventId: bigint
) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';
  if (event.status !== EventStatus.FROZEN) return 'not_frozen';

  return prisma.event.update({
    where: { id },
    data: { contract_event_id: contractEventId, status: EventStatus.PUBLISHED },
  });
}
