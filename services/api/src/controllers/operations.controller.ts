import { Request, Response } from 'express';
import {
  listScanners,
  addScanner,
  removeScanner,
  listWhitelist,
  addToWhitelist,
  removeFromWhitelist,
} from '../services/operations.service';

// --- Scanners ---

export async function getScanners(req: Request, res: Response): Promise<void> {
  try {
    const result = await listScanners(req.params.id, req.user!.wallet_address);
    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scanners' });
  }
}

export async function postScanner(req: Request, res: Response): Promise<void> {
  const { wallet } = req.body;
  if (!wallet) { res.status(400).json({ error: 'wallet is required' }); return; }

  try {
    const result = await addScanner(req.params.id, req.user!.wallet_address, wallet);
    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add scanner' });
  }
}

export async function deleteScanner(req: Request, res: Response): Promise<void> {
  try {
    const result = await removeScanner(req.params.id, req.user!.wallet_address, req.params.wallet);
    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'not_found') { res.status(404).json({ error: 'Scanner not found' }); return; }
    res.json({ message: 'Scanner removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove scanner' });
  }
}

// --- Whitelist ---

export async function getWhitelist(req: Request, res: Response): Promise<void> {
  try {
    const result = await listWhitelist(req.params.id, req.user!.wallet_address);
    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch whitelist' });
  }
}

export async function postWhitelist(req: Request, res: Response): Promise<void> {
  const { wallets } = req.body;
  if (!wallets || !Array.isArray(wallets) || wallets.length === 0) {
    res.status(400).json({ error: 'wallets must be a non-empty array' });
    return;
  }

  try {
    const result = await addToWhitelist(req.params.id, req.user!.wallet_address, wallets);
    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to whitelist' });
  }
}

export async function deleteWhitelist(req: Request, res: Response): Promise<void> {
  try {
    const result = await removeFromWhitelist(req.params.id, req.user!.wallet_address, req.params.wallet);
    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'not_found') { res.status(404).json({ error: 'Wallet not on whitelist' }); return; }
    res.json({ message: 'Wallet removed from whitelist' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove from whitelist' });
  }
}
