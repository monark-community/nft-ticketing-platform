import { Router } from 'express';
import { putTicketType, removeTicketType } from '../controllers/ticketType.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';
import { requireEmail } from '../middlewares/requireEmail';

const router = Router();

router.put('/:id', authenticate, requireRole('ORGANIZER'), requireEmail, putTicketType);
router.delete('/:id', authenticate, requireRole('ORGANIZER'), requireEmail, removeTicketType);

export default router;
