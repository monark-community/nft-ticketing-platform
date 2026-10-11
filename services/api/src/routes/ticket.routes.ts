import { Router } from 'express';
import { getMyTickets, getTicket, validateTicketEntry } from '../controllers/ticket.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { publicRateLimiter, authRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.get('/', authenticate, getMyTickets);
router.get('/:tokenId', publicRateLimiter, getTicket);
router.get('/:tokenId/validate', authRateLimiter, authenticate, requireRole('SCANNER'), validateTicketEntry);

export default router;
