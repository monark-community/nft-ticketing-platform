import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { wallet_address: req.user!.wallet_address },
      select: {
        wallet_address: true,
        role: true,
        email: true,
        nickname: true,
        created_at: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const { nickname, email } = req.body;

  try {
    const user = await prisma.user.update({
      where: { wallet_address: req.user!.wallet_address },
      data: { nickname, email },
      select: {
        wallet_address: true,
        role: true,
        email: true,
        nickname: true,
      },
    });

    res.json(user);
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
}
