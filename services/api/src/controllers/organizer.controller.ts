import { Request, Response } from 'express';
import { OrganizerRequestStatus } from '@prisma/client';
import {
  createOrganizerRequest,
  getLatestOrganizerRequest,
  listOrganizerRequests,
  rejectOrganizerRequest,
} from '../services/organizer.service';

function optionalText(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > maxLength) return null;
  return value.trim();
}

// --- User side ---

export async function postOrganizerRequest(req: Request, res: Response): Promise<void> {
  const organization_name = optionalText(req.body.organization_name, 200);
  const message = optionalText(req.body.message, 1000);

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
  const reason = optionalText(req.body.reason, 1000);
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
