import { OrganizerRequestStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Public user fields only: the nonce must never leave the database.
const USER_SELECT = {
  wallet_address: true,
  role: true,
  email: true,
  first_name: true,
  last_name: true,
  nickname: true,
  created_at: true,
} as const;

// --- User side ---

export async function createOrganizerRequest(
  wallet: string,
  details: { organization_name?: string; message?: string }
) {
  const user = await prisma.user.findUnique({
    where: { wallet_address: wallet },
    select: { role: true },
  });

  // Only an attendee can apply. Organizers already have access and admins don't need it.
  if (!user || user.role !== Role.USER) return 'not_eligible';

  // Rejected users can apply again, but only one request can be open at a time
  const pending = await prisma.organizerRequest.findFirst({
    where: { wallet, status: OrganizerRequestStatus.PENDING },
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

// Rejection is database only. Approval happens on-chain and is recorded by the
// listener or by promoteOrganizer after the admin's grantRole transaction.
export async function rejectOrganizerRequest(id: string, adminWallet: string, reason?: string) {
  const request = await prisma.organizerRequest.findUnique({ where: { id } });
  if (!request) return null;
  if (request.status !== OrganizerRequestStatus.PENDING) return 'not_pending';

  return prisma.organizerRequest.update({
    where: { id },
    data: {
      status: OrganizerRequestStatus.REJECTED,
      reviewed_by: adminWallet,
      reviewed_at: new Date(),
      rejection_reason: reason,
    },
  });
}

async function setOrganizerRole(wallet: string, reviewedBy: string, txHash?: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { wallet_address: wallet },
      data: { role: Role.ORGANIZER },
      select: USER_SELECT,
    });

    // Approve the open request too, so the admin page doesn't show it again.
    // A wallet promoted without a request (the chain is the source of truth) is fine.
    const pending = await tx.organizerRequest.findFirst({
      where: { wallet, status: OrganizerRequestStatus.PENDING },
      orderBy: { created_at: 'desc' },
    });
    const request = pending
      ? await tx.organizerRequest.update({
          where: { id: pending.id },
          data: {
            status: OrganizerRequestStatus.APPROVED,
            reviewed_by: reviewedBy,
            reviewed_at: new Date(),
            tx_hash: txHash,
          },
        })
      : null;

    return { user, request };
  });
}

// The backend holds no private keys: the admin grants ORGANIZER_ROLE from their
// own wallet, then calls this endpoint so the database reflects it immediately.
export async function promoteOrganizer(wallet: string, adminWallet: string, txHash?: string) {
  const user = await prisma.user.findUnique({
    where: { wallet_address: wallet },
    select: { role: true },
  });

  if (!user) return 'not_found';
  if (user.role === Role.ADMIN) return 'admin';

  return setOrganizerRole(wallet, adminWallet, txHash);
}

export async function revokeOrganizer(wallet: string) {
  const user = await prisma.user.findUnique({
    where: { wallet_address: wallet },
    select: { role: true },
  });

  if (!user) return 'not_found';
  // Never demote an admin: ADMIN is a separate, higher-privilege account.
  if (user.role === Role.ADMIN) return 'admin';
  if (user.role !== Role.ORGANIZER) return 'not_organizer';

  return prisma.user.update({
    where: { wallet_address: wallet },
    data: { role: Role.USER },
    select: USER_SELECT,
  });
}

// --- On-chain sync (called by the blockchain listener) ---

// ORGANIZER_ROLE was granted on-chain by an admin wallet. The chain is the
// source of truth, so the user is promoted even if they never submitted a request.
export async function approveOrganizerFromChain(wallet: string, grantedBy: string, txHash?: string) {
  const user = await prisma.user.findUnique({
    where: { wallet_address: wallet },
    select: { role: true },
  });

  if (!user) return 'unknown_user';
  if (user.role === Role.ADMIN) return 'skipped_admin';

  await setOrganizerRole(wallet, grantedBy, txHash);
  return 'approved';
}

// ORGANIZER_ROLE was revoked on-chain, so the user goes back to USER
export async function revokeOrganizerFromChain(wallet: string) {
  const result = await prisma.user.updateMany({
    where: { wallet_address: wallet, role: Role.ORGANIZER },
    data: { role: Role.USER },
  });
  return result.count > 0 ? 'revoked' : 'not_organizer';
}
