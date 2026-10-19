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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: PNG, JPG, WebP'));
    }
  },
});

// Public
router.get('/', publicRateLimiter, getEvents);
router.get('/:id', publicRateLimiter, getEvent);

// Organizer — event lifecycle
router.post('/', authenticate, requireRole('ORGANIZER'), requireEmail, postEvent);
router.put('/:id', authenticate, requireRole('ORGANIZER'), requireEmail, putEvent);
router.post('/:id/freeze', authenticate, requireRole('ORGANIZER'), requireEmail, upload.single('image'), postFreezeEvent);
router.post('/:id/publish', authenticate, requireRole('ORGANIZER'), requireEmail, postPublishEvent);

// Public — ticket types
router.get('/:id/ticket-types', publicRateLimiter, getTicketTypes);

// Organizer — ticket types
router.post('/:id/ticket-types', authenticate, requireRole('ORGANIZER'), requireEmail, postTicketType);

// Organizer — scanners
router.get('/:id/scanners', authenticate, requireRole('ORGANIZER'), requireEmail, getScanners);
router.post('/:id/scanners', authenticate, requireRole('ORGANIZER'), requireEmail, postScanner);
router.delete('/:id/scanners/:wallet', authenticate, requireRole('ORGANIZER'), requireEmail, deleteScanner);

// Organizer — whitelist
router.get('/:id/whitelist', authenticate, requireRole('ORGANIZER'), requireEmail, getWhitelist);
router.post('/:id/whitelist', authenticate, requireRole('ORGANIZER'), requireEmail, postWhitelist);
router.delete('/:id/whitelist/:wallet', authenticate, requireRole('ORGANIZER'), requireEmail, deleteWhitelist);

export default router;
