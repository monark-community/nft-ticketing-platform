import { Request, Response } from 'express';
import { OrganizerRequestStatus } from '@prisma/client';
import { isWalletAddress } from '../lib/validation';
import {
  createOrganizerRequest,
  getLatestOrganizerRequest,
  listOrganizerRequests,
  promoteOrganizer,
  rejectOrganizerRequest,
  revokeOrganizer,
} from '../services/organizer.service';

function optionalText(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > maxLength) return null;
  return value.trim();
}

function optionalTxHash(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return value;
}

// --- User side ---

export async function postOrganizerRequest(req: Request, res: Response): Promise<void> {
  const organization_name = optionalText(req.body?.organization_name, 200);
  const message = optionalText(req.body?.message, 1000);

  if (organization_name === null || message === null) {
    res.status(400).json({ error: 'organization_name (max 200) and message (max 1000) must be text' });
    return;
  }

  try {
    const result = await createOrganizerRequest(req.user!.wallet_address, { organization_name, message });
    if (result === 'not_eligible') {
      res.status(409).json({ error: 'Only users with the USER role can apply to be an organizer' });
      return;
    }
    if (result === 'already_pending') {
      res.status(409).json({ error: 'You already have a pending organizer request' });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create organizer request' });
  }
}

export async function getMyOrganizerRequest(req: Request, res: Response): Promise<void> {
  try {
    const request = await getLatestOrganizerRequest(req.user!.wallet_address);
    if (!request) {
      res.status(404).json({ error: 'No organizer request found' });
      return;
    }
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organizer request' });
  }
}

// --- Admin side ---

export async function getOrganizerRequests(req: Request, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;

  if (status !== undefined && !Object.values(OrganizerRequestStatus).includes(status as OrganizerRequestStatus)) {
    res.status(400).json({ error: `status must be one of [${Object.values(OrganizerRequestStatus).join(', ')}]` });
    return;
  }

  try {
    const requests = await listOrganizerRequests(status as OrganizerRequestStatus | undefined);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organizer requests' });
  }
}

export async function postRejectOrganizerRequest(req: Request, res: Response): Promise<void> {
  const reason = optionalText(req.body?.reason, 1000);
  if (reason === null) {
    res.status(400).json({ error: 'reason must be text (max 1000)' });
    return;
  }

  try {
    const result = await rejectOrganizerRequest(req.params.id, req.user!.wallet_address, reason);
    if (result === null) { res.status(404).json({ error: 'Organizer request not found' }); return; }
    if (result === 'not_pending') { res.status(409).json({ error: 'Only pending requests can be rejected' }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject organizer request' });
  }
}

export async function postPromoteOrganizer(req: Request, res: Response): Promise<void> {
  const { wallet } = req.params;
  if (!isWalletAddress(wallet)) {
    res.status(400).json({ error: 'wallet must be a valid wallet address' });
    return;
  }

  const tx_hash = optionalTxHash(req.body?.tx_hash);
  if (tx_hash === null) {
    res.status(400).json({ error: 'tx_hash must be a 32-byte hex transaction hash' });
    return;
  }

  try {
    const result = await promoteOrganizer(wallet.toLowerCase(), req.user!.wallet_address, tx_hash);
    if (result === 'not_found') { res.status(404).json({ error: 'User not found' }); return; }
    if (result === 'admin') { res.status(409).json({ error: 'Admins cannot be promoted to organizer' }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to promote user to organizer' });
  }
}

export async function deleteOrganizer(req: Request, res: Response): Promise<void> {
  const { wallet } = req.params;
  if (!isWalletAddress(wallet)) {
    res.status(400).json({ error: 'wallet must be a valid wallet address' });
    return;
  }

  try {
    const result = await revokeOrganizer(wallet.toLowerCase());
    if (result === 'not_found') { res.status(404).json({ error: 'User not found' }); return; }
    if (result === 'admin') { res.status(409).json({ error: 'Admins cannot be demoted through this endpoint' }); return; }
    if (result === 'not_organizer') { res.status(409).json({ error: 'User is not an organizer' }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke organizer role' });
  }
}
