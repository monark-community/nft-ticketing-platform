import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: not authenticated' });
      return;
    }

    try {
      // Role is read from the database, not the JWT, so an approval or revocation
      // applies immediately instead of waiting for the user to sign in again.
      const user = await prisma.user.findUnique({
        where: { wallet_address: req.user.wallet_address },
        select: { role: true },
      });

      if (!user) {
        res.status(401).json({ error: 'Unauthorized: user not found' });
        return;
      }

      if (!roles.includes(user.role)) {
        res.status(403).json({ error: `Forbidden: requires one of [${roles.join(', ')}]` });
        return;
      }

      req.user.role = user.role;
      next();
    } catch (err) {
      next(err);
    }
  };
}
