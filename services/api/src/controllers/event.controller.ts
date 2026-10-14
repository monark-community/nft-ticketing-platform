import { Request, Response } from 'express';
import {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  freezeEvent,
  publishEvent,
} from '../services/event.service';
import { pinImageToIPFS, pinMetadataToIPFS, buildEventMetadata, buildTicketMetadata } from '../services/ipfs.service';
import logger from '../lib/logger';

export async function getEvents(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

  try {
    const result = await listEvents(page, limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}

export async function getEvent(req: Request, res: Response): Promise<void> {
  try {
    const event = await getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
}

export async function postEvent(req: Request, res: Response): Promise<void> {
  const { title, description, location, category, start_date, end_date, image_url } = req.body;

  if (!title || !start_date) {
    res.status(400).json({ error: 'title and start_date are required' });
    return;
  }

  try {
    const event = await createEvent(req.user!.wallet_address, {
      title,
      description,
      location,
      category,
      start_date,
      end_date,
      image_url,
    });
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create event' });
  }
}

export async function putEvent(req: Request, res: Response): Promise<void> {
  try {
    const result = await updateEvent(req.params.id, req.user!.wallet_address, req.body);

    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'frozen') { res.status(409).json({ error: 'Event is frozen and cannot be edited' }); return; }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update event' });
  }
}

export async function postFreezeEvent(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'An image file is required to freeze the event' });
    return;
  }

  try {
    // Ownership and status checks happen BEFORE any IPFS upload so failed
    // requests don't leave orphaned pins.
    const event = await getEventById(req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }
    if (event.organizer_wallet !== req.user!.wallet_address) {
      res.status(403).json({ error: 'Not your event' });
      return;
    }
    if (event.status !== 'DRAFT') {
      res.status(409).json({ error: 'Event is already frozen' });
      return;
    }
    if (event.ticket_types.length === 0) {
      res.status(400).json({ error: 'Add at least one ticket type before freezing the event' });
      return;
    }

    let imageCid: string;
    let metadataCid: string;
    let ticketPins: Array<{ id: string; ipfsHash: string; uri: string }>;
    try {
      imageCid = await pinImageToIPFS(file.buffer, file.originalname, file.mimetype);

      const metadata = buildEventMetadata(event, imageCid);
      metadataCid = await pinMetadataToIPFS(metadata);

      ticketPins = await Promise.all(
        event.ticket_types.map(async (tt) => {
          const ticketMetadata = buildTicketMetadata(
            { id: tt.id, name: tt.name, description: tt.description, price: tt.price.toString(), supply: tt.supply },
            event,
            imageCid
          );
          const cid = await pinMetadataToIPFS(ticketMetadata);
          return { id: tt.id, ipfsHash: cid, uri: `ipfs://${cid}` };
        })
      );
    } catch (err: any) {
      const message = err.message ?? 'Failed to pin to IPFS';
      if (
        message.includes('Unsupported file type') ||
        message.includes('maximum allowed size')
      ) {
        res.status(400).json({ error: message });
        return;
      }
      if (message.includes('PINATA_JWT is not configured')) {
        // Server misconfiguration, not a client error. The message names the
        // missing variable without exposing any secret.
        logger.error('Freeze failed: PINATA_JWT is not configured');
        res.status(500).json({ error: message });
        return;
      }
      logger.error('IPFS pinning failed during freeze', { error: err, eventId: req.params.id });
      res.status(502).json({ error: 'Failed to pin metadata to IPFS, please try again later' });
      return;
    }

    const result = await freezeEvent(
      req.params.id,
      req.user!.wallet_address,
      metadataCid,
      ticketPins.map((p) => ({ id: p.id, ipfsHash: p.ipfsHash }))
    );

    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'already_frozen') { res.status(409).json({ error: 'Event is already frozen' }); return; }
    if (result === 'invalid_ticket_type') {
      res.status(409).json({ error: 'Ticket types changed during freeze, please retry' });
      return;
    }

    res.json({ ipfs_hash: metadataCid, ipfs_uri: `ipfs://${metadataCid}`, event: result, ticket_types: ticketPins });
  } catch (err: any) {
    logger.error('Failed to freeze event', { error: err, eventId: req.params.id });
    res.status(500).json({ error: 'Failed to freeze event' });
  }
}

export async function postPublishEvent(req: Request, res: Response): Promise<void> {
  const { contract_event_id } = req.body;

  if (contract_event_id === undefined) {
    res.status(400).json({ error: 'contract_event_id is required' });
    return;
  }

  let contractEventId: bigint;
  try {
    contractEventId = BigInt(contract_event_id);
  } catch {
    res.status(400).json({ error: 'contract_event_id must be an integer' });
    return;
  }
  if (contractEventId < 0n) {
    res.status(400).json({ error: 'contract_event_id must be non-negative' });
    return;
  }

  try {
    const result = await publishEvent(req.params.id, req.user!.wallet_address, contractEventId);

    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'not_frozen') { res.status(409).json({ error: 'Event must be frozen before publishing' }); return; }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish event' });
  }
}
