import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve the backend environment file from this module instead of relying on
// the process working directory (the root `npm run dev` command runs from one
// level above the backend package).
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

function parseFrontendOrigins() {
  // Always include the deployed SPA origin. FRONTEND_ORIGIN may add custom
  // domains or local origins, but CORS must never fall back to '*'.
  const configuredOrigins = process.env.FRONTEND_ORIGIN
    ?? (process.env.NODE_ENV === 'production' ? 'https://collabhub-mu.vercel.app/' : 'http://localhost:5173');

  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const deployedFrontendOrigin = 'https://collabhub-mu.vercel.app';
  if (!origins.includes(deployedFrontendOrigin)) {
    origins.push(deployedFrontendOrigin);
  }

  return origins;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  frontendOrigins: parseFrontendOrigins(),
  // Hosted PostgreSQL providers generally require TLS. Local PostgreSQL
  // remains non-TLS unless DATABASE_SSL=true is set explicitly.
  databaseSsl: (process.env.DATABASE_SSL === 'true' || (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false'))
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
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
