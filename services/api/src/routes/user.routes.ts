import { Router } from 'express';
import { getMe, updateMe } from '../controllers/user.controller';
import { postOrganizerRequest, getMyOrganizerRequest } from '../controllers/organizer.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireEmail } from '../middlewares/requireEmail';

const router = Router();

router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);

// Organizer application
router.post('/me/organizer-request', authenticate, requireEmail, postOrganizerRequest);
router.get('/me/organizer-request', authenticate, requireEmail, getMyOrganizerRequest);

export default router;
