import { Router } from 'express';
import { putTicketType } from '../controllers/ticketType.controller';
import { authenticate } from '../middlewares/authenticate';
import { requireRole } from '../middlewares/requireRole';

const router = Router();

router.put('/:id', authenticate, requireRole('ORGANIZER'), putTicketType);

export default router;
