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
    const ticketType = await createTicketType(
      req.params.id,
      req.user!.wallet_address,
      {
        name,
        description,
        price,
        supply,
        metadata,
      }
    );

    if (ticketType === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (ticketType === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (ticketType === 'frozen') { res.status(409).json({ error: 'Event is frozen and cannot be edited' }); return; }

    res.status(201).json(ticketType);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ticket type' });
  }
}

export async function putTicketType(req: Request, res: Response): Promise<void> {
  // #212: only these fields may change via this endpoint; sold and event_id
  // must never change here.
  const { name, description, price, supply } = req.body ?? {};
  try {
    const result = await updateTicketType(req.params.id, req.user!.wallet_address, {
      name,
      description,
      price,
      supply,
    });

    if (result === null) { res.status(404).json({ error: 'Ticket type not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'frozen') { res.status(409).json({ error: 'Event is frozen and cannot be edited' }); return; }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ticket type' });
  }
}
