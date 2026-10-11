import { Router } from 'express';
import { getNonce, verifySignature, logout } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { authRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.get('/nonce', authRateLimiter, getNonce);
router.post('/verify', authRateLimiter, verifySignature);
router.post('/logout', authenticate, logout);

export default router;
