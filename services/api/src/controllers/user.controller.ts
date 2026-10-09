import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // profile_complete is false until the email step of account creation is done
    res.json({ ...user, profile_complete: user.email !== null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const { nickname } = req.body;
  let { email } = req.body;

  // Email is required and paired with the wallet, so it can be changed but never cleared
  if (email !== undefined) {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      res.status(400).json({ error: 'A valid email is required' });
      return;
    }
    email = email.trim().toLowerCase();
  }

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

    res.json({ ...user, profile_complete: user.email !== null });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
}
