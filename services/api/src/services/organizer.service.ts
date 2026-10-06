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
