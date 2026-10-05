import { Router } from 'express';
import multer from 'multer';
import {
  getEvents,
  getEvent,
  postEvent,
  putEvent,
  postFreezeEvent,
  postPublishEvent,
} from '../controllers/event.controller';
import { getTicketTypes, postTicketType } from '../controllers/ticketType.controller';
import { getScanners, postScanner, deleteScanner } from '../controllers/operations.controller';
import { getWhitelist, postWhitelist, deleteWhitelist } from '../controllers/operations.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { requireEmail } from '../middlewares/requireEmail';
import { publicRateLimiter } from '../middlewares/rateLimiter';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public
router.get('/', publicRateLimiter, getEvents);
router.get('/:id', publicRateLimiter, getEvent);

// Organizer — event lifecycle
router.post('/', authenticate, requireEmail, requireRole('ORGANIZER'), postEvent);
router.put('/:id', authenticate, requireEmail, requireRole('ORGANIZER'), putEvent);
router.post('/:id/freeze', authenticate, requireEmail, requireRole('ORGANIZER'), upload.single('image'), postFreezeEvent);
router.post('/:id/publish', authenticate, requireEmail, requireRole('ORGANIZER'), postPublishEvent);

// Public — ticket types
router.get('/:id/ticket-types', publicRateLimiter, getTicketTypes);

// Organizer — ticket types
router.post('/:id/ticket-types', authenticate, requireEmail, requireRole('ORGANIZER'), postTicketType);

// Organizer — scanners
router.get('/:id/scanners', authenticate, requireEmail, requireRole('ORGANIZER'), getScanners);
router.post('/:id/scanners', authenticate, requireEmail, requireRole('ORGANIZER'), postScanner);
router.delete('/:id/scanners/:wallet', authenticate, requireEmail, requireRole('ORGANIZER'), deleteScanner);

// Organizer — whitelist
router.get('/:id/whitelist', authenticate, requireEmail, requireRole('ORGANIZER'), getWhitelist);
router.post('/:id/whitelist', authenticate, requireEmail, requireRole('ORGANIZER'), postWhitelist);
router.delete('/:id/whitelist/:wallet', authenticate, requireEmail, requireRole('ORGANIZER'), deleteWhitelist);

export default router;
