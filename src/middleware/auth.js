import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findSafeUserById } from '../modules/auth/repository.js';
import { AppError } from '../utils/appError.js';

export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required.');
    const token = header.slice(7).trim();
    if (!token) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required.');
    if (!env.jwtSecret) throw new AppError(500, 'AUTH_CONFIGURATION_ERROR', 'Authentication is not configured.');
    const payload = jwt.verify(token, env.jwtSecret, { issuer: 'joineazy-api' });
    if (typeof payload === 'string' || !payload.sub) throw new AppError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
    const user = await findSafeUserById(payload.sub);
    if (!user) throw new AppError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
    req.auth = { userId: user.id, role: user.role, user };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return next(new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.'));
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') return next(new AppError(401, 'INVALID_TOKEN', 'Invalid authentication token.'));
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required.'));
    if (!roles.includes(req.auth.role)) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'));
    next();
  };
}
