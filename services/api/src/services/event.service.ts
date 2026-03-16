import { EventStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function listEvents(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED },
      skip,
      take: limit,
      orderBy: { start_date: 'asc' },
      include: { ticket_types: true },
    }),
    prisma.event.count({ where: { status: EventStatus.PUBLISHED } }),
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
    start_date?: string;
    end_date?: string;
    image_url?: string;
  }
) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';
  if (event.status !== EventStatus.DRAFT) return 'frozen';

  return prisma.event.update({
    where: { id },
    data: {
      ...data,
      start_date: data.start_date ? new Date(data.start_date) : undefined,
      end_date: data.end_date ? new Date(data.end_date) : undefined,
    },
  });
}

export async function freezeEvent(id: string, organizerWallet: string, ipfsHash: string) {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';
  if (event.status !== EventStatus.DRAFT) return 'already_frozen';

  return prisma.event.update({
    where: { id },
    data: { ipfs_hash: ipfsHash, status: EventStatus.FROZEN },
  });
}

export async function publishEvent(
  id: string,
  organizerWallet: string,
  contractEventId: number
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
