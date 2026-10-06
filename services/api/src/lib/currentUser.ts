import { Request } from 'express';
import { prisma } from './prisma';

export type CurrentUser = { email: string | null; role: string };

// Loads the authenticated user's row once per request so middlewares can share it.
// The JWT only proves who the caller is; email and role come from the database
// so changes (e.g. an organizer approval) apply without logging in again.
export async function loadCurrentUser(req: Request): Promise<CurrentUser | null> {
  if (req.currentUser !== undefined) return req.currentUser;

  req.currentUser = await prisma.user.findUnique({
    where: { wallet_address: req.user!.wallet_address },
    select: { email: true, role: true },
  });
  return req.currentUser;
}
