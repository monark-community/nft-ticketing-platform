import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import eventRoutes from './event.routes';
import ticketTypeRoutes from './ticketType.routes';
import ticketRoutes from './ticket.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/ticket-types', ticketTypeRoutes);
router.use('/tickets', ticketRoutes);

export default router;
