import { Router } from 'express';
import { getAdminEvents } from '../controllers/admin-event.controller';
import {
  deleteOrganizer,
  getOrganizerRequests,
  getOrganizers,
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

// Organizers tab
router.get('/organizers', getOrganizers);

// Promote/revoke organizer access. The admin page calls grantRole/revokeRole
// first and then these endpoints, so the backend never needs a private key.
// Both endpoints verify hasRole() on-chain before changing the database.
router.post('/organizers/:wallet', postPromoteOrganizer);
router.delete('/organizers/:wallet', deleteOrganizer);

// Events tab: every event in every status, with its sale settings (#297). Changing the settings
// is done on-chain from the admin's wallet (adminUpdateEventSettings); the listener saves them.
router.get('/events', getAdminEvents);

export default router;
