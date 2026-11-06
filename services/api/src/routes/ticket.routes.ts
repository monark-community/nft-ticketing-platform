import { Router } from 'express';
import { getMyTickets, getOwnerTickets, getTicket } from '../controllers/ticket.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireEmail } from '../middlewares/requireEmail';
import { publicRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.get('/', authenticate, requireEmail, getMyTickets);
// Before /:tokenId, which would otherwise take "owner" as a token ID
router.get('/owner/:address', publicRateLimiter, getOwnerTickets);
router.get('/:tokenId', publicRateLimiter, getTicket);
// No validate route: whether a ticket is valid is read from the contract, never from this
// database (#118). The scanner checks the signature and ownership on-chain.

export default router;
