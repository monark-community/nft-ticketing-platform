import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

function generateNonceString(): string {
  return ethers.hexlify(ethers.randomBytes(16));
}

export async function getOrCreateUser(walletAddress: string): Promise<string> {
  const nonce = generateNonceString();
  const address = walletAddress.toLowerCase();

  await prisma.user.upsert({
    where: { wallet_address: address },
    update: { nonce },
    create: { wallet_address: address, nonce },
  });

  return nonce;
}

export async function verifyWalletSignature(
  walletAddress: string,
  signature: string
): Promise<{ wallet_address: string; role: string } | null> {
  const address = walletAddress.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { wallet_address: address },
  });

  if (!user || !user.nonce) return null;

  const message = `Sign this message to authenticate with NFTicketPass.\n\nNonce: ${user.nonce}`;

  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();
  } catch {
    return null;
  }

  if (recoveredAddress !== address) return null;

  // Invalidate nonce after successful verification (prevent replay attacks)
  await prisma.user.update({
    where: { wallet_address: address },
    data: { nonce: null },
  });

  return { wallet_address: user.wallet_address, role: user.role };
}

export function issueJWT(wallet_address: string, role: string): string {
  return jwt.sign(
    { wallet_address, role },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '1h' }
  );
}
