import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { confirmation, groupProgressForStudent, groupSubmission, progress, status } from './controller.js';

const router = Router();
router.use(authenticate);
router.post('/assignments/:id/confirmations', confirmation);
router.get('/assignments/:id/submission-status', status);
router.post('/assignment-targets/:targetId/group-submission', groupSubmission);
router.get('/student/progress', progress);
router.get('/groups/:id/progress', groupProgressForStudent);
export default router;
