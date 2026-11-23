import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { create, details, invite, invitations, listAll, lookup, mine, remove, respond } from './controller.js';

const router = Router();
router.get('/', authenticate, requireRole('ADMIN'), listAll);
router.use(authenticate, requireRole('STUDENT'));
router.post('/', create);
router.get('/me', mine);
router.get('/:id', details);
router.get('/:id/invitees', lookup);
router.post('/:id/invitations', invite);
router.delete('/:id/members/:studentId', remove);
export default router;

export const invitationRouter = Router();
invitationRouter.use(authenticate, requireRole('STUDENT'));
invitationRouter.get('/me', invitations);
invitationRouter.patch('/:id', respond);
