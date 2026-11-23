import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { adminDashboard, analytics, studentDashboard, submissions } from './controller.js';

const router = Router();
router.use(authenticate);
router.get('/student/dashboard', studentDashboard);
router.get('/admin/dashboard', adminDashboard);
router.get('/admin/analytics', analytics);
router.get('/admin/submissions', submissions);
export default router;
