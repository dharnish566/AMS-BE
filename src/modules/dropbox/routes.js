import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { callback, connect, disconnect, status, sync } from './controller.js';

const router = Router();
router.get('/callback', callback);
router.use(authenticate);
router.get('/status', status);
router.get('/connect', connect);
router.post('/connect', connect);
router.post('/disconnect', disconnect);
router.post('/sync', sync);

export default router;
