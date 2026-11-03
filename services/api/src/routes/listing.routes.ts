import { Router } from 'express';
import { getListings } from '../controllers/listing.controller';
import { publicRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Public, like the events list: listings are public on-chain anyway
router.get('/', publicRateLimiter, getListings);

export default router;
