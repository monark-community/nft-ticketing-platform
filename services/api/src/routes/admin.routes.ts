import { Router } from 'express';
import { getOrganizerRequests, postRejectOrganizerRequest } from '../controllers/organizer.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireEmail } from '../middlewares/requireEmail';
import { requireRole } from '../middlewares/requireRole';

const router = Router();

// All admin routes require a signed-in ADMIN with a completed account
router.use(authenticate, requireEmail, requireRole('ADMIN'));

// Organizer requests (approval is done on-chain via grantRole from the admin wallet)
router.get('/organizer-requests', getOrganizerRequests);
router.post('/organizer-requests/:id/reject', postRejectOrganizerRequest);

export default router;
