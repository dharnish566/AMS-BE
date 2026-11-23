import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/appError.js';

function getKey() {
  const raw = env.dropboxTokenEncryptionKey;
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw new AppError(503, 'DROPBOX_NOT_CONFIGURED', 'Dropbox token encryption is not configured.');
  }

  const trimmed = raw.trim();
  // 64-char hex key
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // 32-byte base64 key
  try {
    const base64Buf = Buffer.from(trimmed, 'base64');
    if (base64Buf.length === 32) {
      return base64Buf;
    }
  } catch {
    // fall through to hash derivation
  }

  // Fallback: derive 32 bytes deterministically using SHA-256
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

export function encryptSecret(value) {
  if (!value) return '';
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value) {
  if (!value) return '';
  try {
    const parts = value.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload structure');
    }
    const [ivStr, tagStr, encryptedStr] = parts;
    const key = getKey();
    const iv = Buffer.from(ivStr, 'base64url');
    const tag = Buffer.from(tagStr, 'base64url');
    const encrypted = Buffer.from(encryptedStr, 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError(503, 'DROPBOX_TOKEN_INVALID', 'The Dropbox connection could not be read. Reconnect Dropbox.');
  }
}
