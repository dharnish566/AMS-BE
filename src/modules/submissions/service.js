import { AppError } from '../../utils/appError.js';
import { confirmTargetStudent, declareGroupSubmission, getAssignmentSubmissionStatus, getAssignmentSubmissionStatusForProfessor, getGroupProgress, getStudentProgress } from './repository.js';

export async function assignmentStatus(assignmentId, user) { const rows = user.role === 'ADMIN' ? await getAssignmentSubmissionStatusForProfessor(assignmentId, user.id) : await getAssignmentSubmissionStatus(assignmentId, user.id); if (!rows.length) throw new AppError(user.role === 'ADMIN' ? 404 : 403, user.role === 'ADMIN' ? 'ASSIGNMENT_NOT_FOUND' : 'NOT_ELIGIBLE', user.role === 'ADMIN' ? 'Assignment not found.' : 'You are not eligible for this assignment.'); return { targets: rows }; }
export async function confirm(assignmentId, targetStudentId, studentId) { return confirmTargetStudent({ assignmentId, targetStudentId, studentId }); }
export async function groupSubmit(targetId, studentId) { return declareGroupSubmission({ targetId, studentId }); }
export async function studentProgress(studentId) { return getStudentProgress(studentId); }
export async function groupProgress(groupId, studentId) { const rows = await getGroupProgress(groupId, studentId); if (!rows.length) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this group progress.'); return { groupId, assignments: rows }; }
