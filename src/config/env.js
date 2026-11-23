import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the backend environment file from this module instead of relying on
// the process working directory (the root `npm run dev` command runs from one
// level above the backend package).
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });


export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  frontendOrigins: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  databaseSsl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD,
  demoStudentPassword: process.env.DEMO_STUDENT_PASSWORD,
  demoSeedPassword: process.env.DEMO_SEED_PASSWORD,
  testOnedriveUrl: process.env.TEST_ONEDRIVE_URL,
  dropboxIntegrationEnabled: process.env.DROPBOX_INTEGRATION_ENABLED === 'true',
  dropboxAppKey: process.env.DROPBOX_APP_KEY,
  dropboxAppSecret: process.env.DROPBOX_APP_SECRET,
  dropboxRedirectUri: process.env.DROPBOX_REDIRECT_URI,
  dropboxTokenEncryptionKey: process.env.DROPBOX_TOKEN_ENCRYPTION_KEY,
};
