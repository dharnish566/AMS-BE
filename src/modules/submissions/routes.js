import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import {
  confirmation,
  getMySubmission,
  getSubmissions,
  groupProgressForStudent,
  groupSubmission,
  handleConfirmSubmission,
  progress,
  review,
  status,
  verify,
} from './controller.js';

const router = Router();
router.use(authenticate);

// Student assignment submission endpoints
router.get('/assignments/:id/my-submission', getMySubmission);
router.get('/assignments/:id/submission-status', status);
router.post('/assignments/:id/verify-upload', verify);
router.post('/assignments/:id/confirm-submission', handleConfirmSubmission);
router.post('/assignments/:id/confirmations', confirmation);
router.post('/assignment-targets/:targetId/group-submission', groupSubmission);

// Professor submission tracking and review endpoints
router.get('/assignments/:id/submissions', getSubmissions);
router.post('/assignments/:id/submissions/:submissionId/review', review);

// Progress endpoints
router.get('/student/progress', progress);
router.get('/groups/:id/progress', groupProgressForStudent);

export default router;
