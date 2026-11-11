import { Request, Response } from 'express';
import { ADMIN_EVENT_SEARCH_MAX, listAdminEvents } from '../services/admin-event.service';

// GET /api/admin/events?q=&live=&page=&limit= (#297)
export async function getAdminEvents(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

  // A repeated parameter (?q=a&q=b) arrives as an array
  const { q, live } = req.query;
  if (q !== undefined && (typeof q !== 'string' || q.trim().length > ADMIN_EVENT_SEARCH_MAX)) {
    res.status(400).json({ error: `q must be a single value of ${ADMIN_EVENT_SEARCH_MAX} characters or fewer` });
    return;
  }
  if (live !== undefined && live !== 'true' && live !== 'false') {
    res.status(400).json({ error: 'live must be true or false' });
    return;
  }

  try {
    const result = await listAdminEvents(page, limit, {
      q: q?.trim() || undefined,
      live: live === undefined ? undefined : live === 'true',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}
