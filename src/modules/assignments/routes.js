import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { create, details, list, patch, publish } from './controller.js';

const router = Router();
router.use(authenticate);
router.post('/', create);
router.get('/', list);
router.get('/:id', details);
router.patch('/:id', patch);
router.post('/:id/publish', publish);
export default router;
