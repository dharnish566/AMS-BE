import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/appError.js';
import { createStudent, findSafeUserById, findUserByEmail } from './repository.js';

function requireJwtSecret() {
  if (!env.jwtSecret) throw new AppError(500, 'AUTH_CONFIGURATION_ERROR', 'Authentication is not configured.');
  return env.jwtSecret;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function safeUser(user) {
  const { password_hash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

function issueToken(user) {
  return jwt.sign({ sub: user.id }, requireJwtSecret(), { expiresIn: env.jwtExpiresIn, issuer: 'joineazy-api' });
}

export async function registerStudent(input) {
  const user = {
    fullName: input.fullName.trim(),
    email: normalizeEmail(input.email),
    studentId: input.studentId.trim(),
    passwordHash: await bcrypt.hash(input.password, 12),
  };
  try {
    const created = await createStudent(user);
    return { user: safeUser(created), accessToken: issueToken(created) };
  } catch (error) {
    if (error.code === '23505') throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with that email or student ID already exists.');
    throw error;
  }
}

export async function login(input) {
  const user = await findUserByEmail(normalizeEmail(input.email));
  const valid = user ? await bcrypt.compare(input.password, user.password_hash) : false;
  if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  return { user: safeUser(user), accessToken: issueToken(user) };
}

export async function getCurrentUser(userId) {
  const user = await findSafeUserById(userId);
  if (!user) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required.');
  return safeUser(user);
}
