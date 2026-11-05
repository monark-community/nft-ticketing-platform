import { OrganizerRequestStatus, Prisma, Role } from '@prisma/client';
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

  try {
    return await prisma.organizerRequest.create({
      data: {
        wallet,
        organization_name: details.organization_name,
        message: details.message,
      },
    });
  } catch (err) {
    // A partial unique index allows only one PENDING request per wallet. If two
    // requests race past the findFirst above, the second insert hits P2002.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return 'already_pending';
    }
    throw err;
  }
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

// The Organizers tab: every ORGANIZER with their event count and the date their
// latest approved request was reviewed.
export async function listOrganizers() {
  const organizers = await prisma.user.findMany({
    where: { role: Role.ORGANIZER },
    orderBy: { created_at: 'asc' },
    select: {
      wallet_address: true,
      email: true,
      first_name: true,
      last_name: true,
      nickname: true,
      _count: { select: { organized_events: true } },
      organizer_requests: {
        where: { status: OrganizerRequestStatus.APPROVED },
        orderBy: { reviewed_at: 'desc' },
        take: 1,
        select: { reviewed_at: true, organization_name: true },
      },
    },
  });

  return organizers.map(({ wallet_address, _count, organizer_requests, ...user }) => ({
    wallet: wallet_address,
    ...user,
    event_count: _count.organized_events,
    organization_name: organizer_requests[0]?.organization_name ?? null,
    approved_at: organizer_requests[0]?.reviewed_at ?? null,
  }));
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
    // The listener can see a RoleGranted event before the wallet has ever signed
    // in, so create the account instead of dropping the on-chain approval.
    const user = await tx.user.upsert({
      where: { wallet_address: wallet },
      update: { role: Role.ORGANIZER },
      create: { wallet_address: wallet, role: Role.ORGANIZER },
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

  if (user?.role === Role.ADMIN) return 'skipped_admin';

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
