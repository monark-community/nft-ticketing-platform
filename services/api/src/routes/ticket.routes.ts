import { Router } from 'express';
import { getMyTickets, getOwnerTickets, getTicket, validateTicketEntry } from '../controllers/ticket.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { requireEmail } from '../middlewares/requireEmail';
import { publicRateLimiter, authRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.get('/', authenticate, requireEmail, getMyTickets);
// Before /:tokenId, which would otherwise take "owner" as a token ID
router.get('/owner/:address', publicRateLimiter, getOwnerTickets);
router.get('/:tokenId', publicRateLimiter, getTicket);
router.get('/:tokenId/validate', authRateLimiter, authenticate, requireRole('SCANNER'), requireEmail, validateTicketEntry);

export default router;
