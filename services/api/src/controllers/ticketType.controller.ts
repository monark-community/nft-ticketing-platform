import { Request, Response } from 'express';
import {
  listTicketTypesForEvent,
  createTicketType,
  updateTicketType,
} from '../services/ticket.service';

export async function getTicketTypes(req: Request, res: Response): Promise<void> {
  try {
    const types = await listTicketTypesForEvent(req.params.id);
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ticket types' });
  }
}

export async function postTicketType(req: Request, res: Response): Promise<void> {
  const { name, description, price, supply, metadata } = req.body;

  if (!name || price === undefined || supply === undefined) {
    res.status(400).json({ error: 'name, price, and supply are required' });
    return;
  }

  try {
    const ticketType = await createTicketType(req.params.id, {
      name,
      description,
      price,
      supply,
      metadata,
    });
    res.status(201).json(ticketType);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ticket type' });
  }
}

export async function putTicketType(req: Request, res: Response): Promise<void> {
  try {
    const result = await updateTicketType(req.params.id, req.user!.wallet_address, req.body);

    if (result === null) { res.status(404).json({ error: 'Ticket type not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ticket type' });
  }
}
