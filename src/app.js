import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/routes.js';
import groupRoutes, { invitationRouter } from './modules/groups/routes.js';
import assignmentRoutes from './modules/assignments/routes.js';
import submissionRoutes from './modules/submissions/routes.js';
import analyticsRoutes from './modules/analytics/routes.js';
import dropboxRoutes from './modules/dropbox/routes.js';

export function createApp() {
  const app = express();
  // Vercel sits in front of the function and forwards X-Forwarded-For.
  // Trust the first proxy so express-rate-limit can identify clients safely.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({
    origin: env.frontendOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get('/', (_req, res) => res.send('Joineazy API is running'));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'joineazy-api' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/integrations/dropbox', dropboxRoutes);
  // Also support /integrations/dropbox directly in case Dropbox redirect URI is configured without /api
  app.use('/integrations/dropbox', dropboxRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/invitations', invitationRouter);
  app.use('/api/assignments', assignmentRoutes);
  app.use('/api', submissionRoutes);
  app.use('/api', analyticsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// Also expose a default Express handler for Vercel deployments that detect
// this module directly as a function entry point.
export default createApp();
