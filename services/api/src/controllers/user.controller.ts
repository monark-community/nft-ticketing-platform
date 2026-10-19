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
        first_name: true,
        last_name: true,
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
  let { email , first_name, last_name} = req.body;

  // Email is required and paired with the wallet, so it can be changed but never cleared
  if (email !== undefined) {
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      res.status(400).json({ error: 'A valid email is required' });
      return;
    }
    email = email.trim().toLowerCase();
  }

  if (nickname !== undefined && nickname !== null && typeof nickname !== 'string') {
    res.status(400).json({ error: 'nickname must be a string' });
    return;
  }

  if (first_name !== undefined) {
    if (typeof first_name !== 'string' || first_name.trim() === '') {
      res.status(400).json({ error: 'first_name must be a non-empty string' });
      return;
    }
    first_name = first_name.trim();
  }

  if (last_name !== undefined) {
    if (typeof last_name !== 'string' || last_name.trim() === '') {
      res.status(400).json({ error: 'last_name must be a non-empty string' });
      return;
    }
    last_name = last_name.trim();
  }

  try {
    const user = await prisma.user.update({
      where: { wallet_address: req.user!.wallet_address },
      data: { nickname, email, first_name, last_name },
      select: {
        wallet_address: true,
        role: true,
        email: true,
        first_name: true,
        last_name: true,
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
