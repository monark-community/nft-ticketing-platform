import { Request, Response } from 'express';
import {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  freezeEvent,
  publishEvent,
} from '../services/event.service';
import { pinImageToIPFS, pinMetadataToIPFS } from '../services/ipfs.service';

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
  const { title, description, location, start_date, end_date, image_url } = req.body;

  if (!title || !start_date) {
    res.status(400).json({ error: 'title and start_date are required' });
    return;
  }

  try {
    const event = await createEvent(req.user!.wallet_address, {
      title,
      description,
      location,
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
    const event = await getEventById(req.params.id);
    if (!event) { res.status(404).json({ error: 'Event not found' }); return; }

    const imageCid = await pinImageToIPFS(file.buffer, file.originalname, file.mimetype);

    const metadata = {
      name: event.title,
      description: event.description ?? '',
      image: `ipfs://${imageCid}`,
      attributes: {
        location: event.location,
        start_date: event.start_date,
        end_date: event.end_date,
      },
    };

    const metadataCid = await pinMetadataToIPFS(metadata);
    const result = await freezeEvent(req.params.id, req.user!.wallet_address, metadataCid);

    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'already_frozen') { res.status(409).json({ error: 'Event is already frozen' }); return; }

    res.json({ ipfs_hash: metadataCid, event: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to freeze event' });
  }
}

export async function postPublishEvent(req: Request, res: Response): Promise<void> {
  const { contract_event_id } = req.body;

  if (contract_event_id === undefined) {
    res.status(400).json({ error: 'contract_event_id is required' });
    return;
  }

  try {
    const result = await publishEvent(req.params.id, req.user!.wallet_address, contract_event_id);

    if (result === null) { res.status(404).json({ error: 'Event not found' }); return; }
    if (result === 'forbidden') { res.status(403).json({ error: 'Not your event' }); return; }
    if (result === 'not_frozen') { res.status(409).json({ error: 'Event must be frozen before publishing' }); return; }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish event' });
  }
}
