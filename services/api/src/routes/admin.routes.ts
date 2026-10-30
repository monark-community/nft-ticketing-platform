import { Router } from 'express';
import {
  deleteOrganizer,
  getOrganizerRequests,
  postPromoteOrganizer,
  postRejectOrganizerRequest,
} from '../controllers/organizer.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireEmail } from '../middlewares/requireEmail';
import { requireRole } from '../middlewares/requireRole';

const router = Router();

// All admin routes require a signed-in ADMIN with a completed account
router.use(authenticate, requireRole('ADMIN'), requireEmail);

// Organizer requests. Approval is done on-chain from the admin's wallet, then
// recorded here; rejection only needs the database.
router.get('/organizer-requests', getOrganizerRequests);
router.post('/organizer-requests/:id/reject', postRejectOrganizerRequest);

// Promote/revoke organizer access. The admin page calls grantRole/revokeRole
// first and then these endpoints, so the backend never needs a private key.
router.post('/organizers/:wallet', postPromoteOrganizer);
router.delete('/organizers/:wallet', deleteOrganizer);

export default router;
