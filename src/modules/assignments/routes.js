import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { create, details, dropboxRequest, list, patch, publish } from './controller.js';

const router = Router();
router.use(authenticate);
router.post('/', create);
router.get('/', list);
router.get('/:id', details);
router.patch('/:id', patch);
router.post('/:id/publish', publish);
router.post('/:id/dropbox-requests', dropboxRequest);
router.post('/:id/dropbox-request', dropboxRequest);

export default router;
