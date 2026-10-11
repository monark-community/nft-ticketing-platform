import { Request, Response } from 'express';
import { getOrCreateUser, verifyWalletSignature, issueJWT } from '../services/auth.service';

export async function getNonce(req: Request, res: Response): Promise<void> {
  const wallet = req.query.wallet as string;

  if (!wallet) {
    res.status(400).json({ error: 'wallet query parameter is required' });
    return;
  }

  try {
    const nonce = await getOrCreateUser(wallet);
    res.json({ nonce });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
}

export async function verifySignature(req: Request, res: Response): Promise<void> {
  const { wallet, signature } = req.body;

  if (!wallet || !signature) {
    res.status(400).json({ error: 'wallet and signature are required' });
    return;
  }

  try {
    const user = await verifyWalletSignature(wallet, signature);

    if (!user) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const token = issueJWT(user.wallet_address, user.role);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    res.json({ wallet_address: user.wallet_address, role: user.role });
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed' });
  }
}

export function logout(req: Request, res: Response): void {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
}
