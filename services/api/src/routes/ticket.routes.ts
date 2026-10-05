import { Router } from 'express';
import { getMyTickets, getTicket, validateTicketEntry } from '../controllers/ticket.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { requireEmail } from '../middlewares/requireEmail';
import { publicRateLimiter, authRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.get('/', authenticate, requireEmail, getMyTickets);
router.get('/:tokenId', publicRateLimiter, getTicket);
router.get('/:tokenId/validate', authRateLimiter, authenticate, requireEmail, requireRole('SCANNER'), validateTicketEntry);

export default router;
