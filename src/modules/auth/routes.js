import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginUser, me, register } from './controller.js';
import { authenticate } from '../../middleware/auth.js';

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please try again later.' } } });
const router = Router();
router.post('/register', register);
router.post('/login', loginLimiter, loginUser);
router.get('/me', authenticate, me);
export default router;
