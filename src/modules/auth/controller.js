import { registerStudent, login, getCurrentUser } from './service.js';
import { loginSchema, registerSchema } from './validation.js';
import { AppError } from '../../utils/appError.js';

function parse(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields and try again.');
  return result.data;
}

export async function register(req, res, next) {
  try { res.status(201).json(await registerStudent(parse(registerSchema, req.body))); } catch (error) { next(error); }
}

export async function loginUser(req, res, next) {
  try { res.json(await login(parse(loginSchema, req.body))); } catch (error) { next(error); }
}

export async function me(req, res, next) {
  try { res.json({ user: await getCurrentUser(req.auth.userId) }); } catch (error) { next(error); }
}
