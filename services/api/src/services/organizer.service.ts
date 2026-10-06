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
