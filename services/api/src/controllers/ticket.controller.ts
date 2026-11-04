import { Request, Response } from 'express';
import {
  getTicketsByOwner,
  getTicketsByWallet,
  getTicketByTokenId,
  validateTicket,
} from '../services/ticket.service';
import { isWalletAddress } from '../lib/validation';
import logger from '../lib/logger';

export async function getMyTickets(req: Request, res: Response): Promise<void> {
  try {
    const tickets = await getTicketsByWallet(req.user!.wallet_address);
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
}

// GET /api/tickets/owner/:address (#219)
export async function getOwnerTickets(req: Request, res: Response): Promise<void> {
  const { address } = req.params;
  if (!isWalletAddress(address)) {
    res.status(400).json({ error: 'address must be a wallet address' });
    return;
  }

  try {
    res.json({ tickets: await getTicketsByOwner(address) });
  } catch (err) {
    logger.error('Failed to fetch tickets by owner', { error: err });
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
}

export async function getTicket(req: Request, res: Response): Promise<void> {
  let tokenId: bigint;
  try { tokenId = BigInt(req.params.tokenId); } catch {
    res.status(400).json({ error: 'Invalid tokenId' });
    return;
  }

  try {
    const ticket = await getTicketByTokenId(tokenId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
}

export async function validateTicketEntry(req: Request, res: Response): Promise<void> {
  let tokenId: bigint;
  try { tokenId = BigInt(req.params.tokenId); } catch {
    res.status(400).json({ error: 'Invalid tokenId' });
    return;
  }
  const { eventId } = req.query;

  if (!eventId) {
    res.status(400).json({ error: 'eventId query parameter is required' });
    return;
  }

  try {
    const result = await validateTicket(tokenId, eventId as string);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to validate ticket' });
  }
}
