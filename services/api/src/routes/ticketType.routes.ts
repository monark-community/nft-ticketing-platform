import { Router } from 'express';
import { putTicketType } from '../controllers/ticketType.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { requireEmail } from '../middlewares/requireEmail';

const router = Router();

router.put('/:id', authenticate, requireEmail, requireRole('ORGANIZER'), putTicketType);

export default router;
