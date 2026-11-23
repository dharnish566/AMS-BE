import { AppError } from '../../utils/appError.js';
import { z } from 'zod';
import { assignmentStatus, confirm, groupProgress, groupSubmit, studentProgress } from './service.js';

export async function status(req, res, next) { try { res.json(await assignmentStatus(req.params.id, { id: req.auth.userId, role: req.auth.role })); } catch (error) { next(error); } }
export async function confirmation(req, res, next) { try { if (req.auth.role !== 'STUDENT') throw new AppError(403, 'FORBIDDEN', 'Only students can confirm submissions.'); const targetStudentId = z.string().uuid().safeParse(req.body?.targetStudentId); if (!targetStudentId.success) throw new AppError(400, 'VALIDATION_ERROR', 'A valid target student is required.'); res.status(201).json({ confirmation: await confirm(req.params.id, targetStudentId.data, req.auth.userId) }); } catch (error) { next(error); } }
export async function groupSubmission(req, res, next) { try { if (req.auth.role !== 'STUDENT') throw new AppError(403, 'FORBIDDEN', 'Only students can declare group submissions.'); res.status(201).json({ submission: await groupSubmit(req.params.targetId, req.auth.userId) }); } catch (error) { next(error); } }
export async function progress(req, res, next) { try { if (req.auth.role !== 'STUDENT') throw new AppError(403, 'FORBIDDEN', 'Only students can view student progress.'); res.json(await studentProgress(req.auth.userId)); } catch (error) { next(error); } }
export async function groupProgressForStudent(req, res, next) { try { if (req.auth.role !== 'STUDENT') throw new AppError(403, 'FORBIDDEN', 'Only students can view group progress.'); res.json(await groupProgress(req.params.id, req.auth.userId)); } catch (error) { next(error); } }
