import { z } from 'zod';

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be 72 characters or fewer.')
  .refine((value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value), 'Password must include uppercase, lowercase, and a number.');

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  studentId: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9-]+$/),
  password: passwordSchema,
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(72),
}).strict();
