import { OrganizerRequestStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

// --- User side ---

export async function createOrganizerRequest(
  wallet: string,
  details: { organization_name?: string; message?: string }
) {
  const user = await prisma.user.findUnique({ where: { wallet_address: wallet } });
  if (!user || user.role !== 'USER') return 'not_eligible';

  // Rejected users can re-apply, but only one request can be open at a time
  const pending = await prisma.organizerRequest.findFirst({
    where: { wallet, status: 'PENDING' },
  });
  if (pending) return 'already_pending';

  return prisma.organizerRequest.create({
    data: {
      wallet,
      organization_name: details.organization_name,
      message: details.message,
    },
  });
}

export async function getLatestOrganizerRequest(wallet: string) {
  return prisma.organizerRequest.findFirst({
    where: { wallet },
    orderBy: { created_at: 'desc' },
  });
}

// --- Admin side ---

export async function listOrganizerRequests(status?: OrganizerRequestStatus) {
  return prisma.organizerRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { created_at: 'asc' },
    include: {
      user: { select: { email: true, nickname: true, first_name: true, last_name: true } },
    },
  });
}

// Rejection is database only. Approval happens on-chain and is picked up by the listener.
export async function rejectOrganizerRequest(id: string, adminWallet: string, reason?: string) {
  const request = await prisma.organizerRequest.findUnique({ where: { id } });
  if (!request) return null;
  if (request.status !== 'PENDING') return 'not_pending';

  return prisma.organizerRequest.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewed_by: adminWallet,
      reviewed_at: new Date(),
      rejection_reason: reason,
    },
  });
}

// --- On-chain sync (called by the blockchain listener) ---

// ORGANIZER_ROLE was granted on-chain by an admin wallet. The chain is the source
// of truth, so the user is promoted even if they never submitted a request.
export async function approveOrganizerFromChain(wallet: string, grantedBy: string, txHash: string) {
  const user = await prisma.user.findUnique({ where: { wallet_address: wallet } });
  if (!user) return 'unknown_user';
  if (user.role === 'ADMIN') return 'skipped_admin';

  const pending = await prisma.organizerRequest.findFirst({
    where: { wallet, status: 'PENDING' },
    orderBy: { created_at: 'desc' },
  });
  const review = { status: 'APPROVED' as const, reviewed_by: grantedBy, reviewed_at: new Date(), tx_hash: txHash };

  await prisma.$transaction([
    prisma.user.update({ where: { wallet_address: wallet }, data: { role: 'ORGANIZER' } }),
    pending
      ? prisma.organizerRequest.update({ where: { id: pending.id }, data: review })
      : prisma.organizerRequest.create({ data: { wallet, ...review } }),
  ]);
  return 'approved';
}

// ORGANIZER_ROLE was revoked on-chain, so the user goes back to USER
export async function revokeOrganizerFromChain(wallet: string) {
  const result = await prisma.user.updateMany({
    where: { wallet_address: wallet, role: 'ORGANIZER' },
    data: { role: 'USER' },
  });
  return result.count > 0 ? 'revoked' : 'not_organizer';
}
