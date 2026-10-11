import { prisma } from '../lib/prisma';

// --- Scanners ---

export async function listScanners(eventId: string, organizerWallet: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';

  return prisma.scanner.findMany({ where: { event_id: eventId } });
}

export async function addScanner(eventId: string, organizerWallet: string, wallet: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';

  return prisma.scanner.upsert({
    where: { event_id_wallet: { event_id: eventId, wallet: wallet.toLowerCase() } },
    update: {},
    create: { event_id: eventId, wallet: wallet.toLowerCase(), assigned_by: organizerWallet },
  });
}

export async function removeScanner(eventId: string, organizerWallet: string, wallet: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';

  const scanner = await prisma.scanner.findUnique({
    where: { event_id_wallet: { event_id: eventId, wallet: wallet.toLowerCase() } },
  });
  if (!scanner) return 'not_found';

  return prisma.scanner.delete({
    where: { event_id_wallet: { event_id: eventId, wallet: wallet.toLowerCase() } },
  });
}

// --- Whitelist ---

export async function listWhitelist(eventId: string, organizerWallet: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';

  return prisma.whitelist.findMany({ where: { event_id: eventId } });
}

export async function addToWhitelist(eventId: string, organizerWallet: string, wallets: string[]) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';

  const records = wallets.map((w) => ({ event_id: eventId, wallet: w.toLowerCase(), added_by: organizerWallet }));
  return prisma.whitelist.createMany({ data: records, skipDuplicates: true });
}

export async function removeFromWhitelist(
  eventId: string,
  organizerWallet: string,
  wallet: string
) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.organizer_wallet !== organizerWallet) return 'forbidden';

  const entry = await prisma.whitelist.findUnique({
    where: { event_id_wallet: { event_id: eventId, wallet: wallet.toLowerCase() } },
  });
  if (!entry) return 'not_found';

  return prisma.whitelist.delete({
    where: { event_id_wallet: { event_id: eventId, wallet: wallet.toLowerCase() } },
  });
}
