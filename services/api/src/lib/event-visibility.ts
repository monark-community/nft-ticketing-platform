import { prisma } from './prisma';
import type { JwtPayload } from '../middlewares/authenticate';

// Who may read an event by its ID: a published event is public; a draft or frozen event only
// its organizer or an admin. Everyone else gets a 404, the same as for an event that doesn't
// exist, so an unpublished event's ID tells them nothing.
export async function canViewEvent(
  event: { status: string; organizer_wallet: string },
  user: JwtPayload | undefined
): Promise<boolean> {
  if (event.status === 'PUBLISHED') return true;
  if (!user) return false;
  if (event.organizer_wallet.toLowerCase() === user.wallet_address.toLowerCase()) return true;

  // The role is read from the database, like requireRole, so a revoked admin loses access at once
  const account = await prisma.user.findUnique({
    where: { wallet_address: user.wallet_address },
    select: { role: true },
  });
  return account?.role === 'ADMIN';
}
