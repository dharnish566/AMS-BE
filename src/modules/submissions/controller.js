import { z } from 'zod';
import { AppError } from '../../utils/appError.js';
import { reviewAssignmentSubmission, verifyUpload } from '../dropbox/service.js';
import {
  assignmentStatus,
  assignmentSubmissionsTracker,
  confirm,
  confirmSubmission,
  groupProgress,
  groupSubmit,
  mySubmission,
  studentProgress,
} from './service.js';

export async function status(req, res, next) {
  try {
    res.json(await assignmentStatus(req.params.id, { id: req.auth.userId, role: req.auth.role }));
  } catch (error) {
    next(error);
  }
}

export async function getMySubmission(req, res, next) {
  try {
    if (req.auth.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students have student assignment submissions.');
    }
    res.json(await mySubmission(req.params.id, req.auth.userId));
  } catch (error) {
    next(error);
  }
}

export async function confirmation(req, res, next) {
  try {
    if (req.auth.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students can confirm submissions.');
    }
    const targetStudentId = z.string().uuid().safeParse(req.body?.targetStudentId);
    if (!targetStudentId.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A valid target student is required.');
    }
    res.status(201).json({ confirmation: await confirm(req.params.id, targetStudentId.data, req.auth.userId) });
  } catch (error) {
    next(error);
  }
}

export async function handleConfirmSubmission(req, res, next) {
  try {
    if (req.auth.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students can confirm submissions.');
    }
    const result = await confirmSubmission(req.params.id, req.auth.userId, req.body ?? {});
    res.status(201).json({ confirmation: result });
  } catch (error) {
    next(error);
  }
}

export async function getSubmissions(req, res, next) {
  try {
    if (req.auth.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only professors can view assignment submissions.');
    }
    res.json(await assignmentSubmissionsTracker(req.params.id, req.auth.userId));
  } catch (error) {
    next(error);
  }
}

export async function verify(req, res, next) {
  try {
    if (req.auth.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students can verify uploads.');
    }
    res.json({ verification: await verifyUpload({ assignmentId: req.params.id, studentId: req.auth.userId }) });
  } catch (error) {
    next(error);
  }
}

export async function review(req, res, next) {
  try {
    if (req.auth.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only professors can review submissions.');
    }
    const decision = z.enum(['VERIFIED', 'REJECTED']).safeParse(req.body?.decision);
    if (!decision.success) {
      throw new AppError(400, 'INVALID_REVIEW', 'A valid review decision (VERIFIED or REJECTED) is required.');
    }
    res.json({
      verification: await reviewAssignmentSubmission({
        assignmentId: req.params.id,
        verificationId: req.params.submissionId,
        professorId: req.auth.userId,
        decision: decision.data,
        reason: req.body?.reason,
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function groupSubmission(req, res, next) {
  try {
    if (req.auth.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students can declare group submissions.');
    }
    res.status(201).json({ submission: await groupSubmit(req.params.targetId, req.auth.userId) });
  } catch (error) {
    next(error);
  }
}

export async function progress(req, res, next) {
  try {
    if (req.auth.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students can view student progress.');
    }
    res.json(await studentProgress(req.auth.userId));
  } catch (error) {
    next(error);
  }
}

export async function groupProgressForStudent(req, res, next) {
  try {
    if (req.auth.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students can view group progress.');
    }
    res.json(await groupProgress(req.params.id, req.auth.userId));
  } catch (error) {
    next(error);
  }
}
