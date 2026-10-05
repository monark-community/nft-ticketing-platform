import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

// Email is collected as the second step of account creation (DB design Q&A, Q1).
// The column is nullable because the user row is created at login, so the
// requirement is enforced here: authenticated routes are blocked until it is set.
export async function requireEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized: not authenticated' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { wallet_address: req.user.wallet_address },
      select: { email: true },
    });

    if (!user?.email) {
      res.status(403).json({ error: 'Email required to complete account setup', code: 'EMAIL_REQUIRED' });
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}
