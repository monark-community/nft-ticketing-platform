import { prisma } from '../lib/prisma';

// A wallet must belong to a platform account before it can be whitelisted or
// assigned as a scanner (DB design Q&A, Q3). A user row alone isn't enough, since
// one is created for any wallet that requests a login nonce; the account only
// counts once the email step is done.
async function findUnregisteredWallets(wallets: string[]): Promise<string[]> {
  const registered = await prisma.user.findMany({
    where: { wallet_address: { in: wallets }, email: { not: null } },
    select: { wallet_address: true },
  });
  const registeredSet = new Set(registered.map((u) => u.wallet_address));
  return wallets.filter((w) => !registeredSet.has(w));
}

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

  const unregistered = await findUnregisteredWallets([wallet.toLowerCase()]);
  if (unregistered.length > 0) return 'unregistered';

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

  const normalized = [...new Set(wallets.map((w) => w.toLowerCase()))];

  // Reject the whole batch so the organizer can fix the list in one go
  const unregistered = await findUnregisteredWallets(normalized);
  if (unregistered.length > 0) return { unregistered };

  const records = normalized.map((w) => ({ event_id: eventId, wallet: w, added_by: organizerWallet }));
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
