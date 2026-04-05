import { Router } from 'express';
import { getMe, updateMe } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';

const router = Router();

router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);

export default router;
