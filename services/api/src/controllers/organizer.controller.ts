import { Request, Response } from 'express';
import { createOrganizerRequest, getLatestOrganizerRequest } from '../services/organizer.service';

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
