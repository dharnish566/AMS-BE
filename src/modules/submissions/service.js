import { AppError } from '../../utils/appError.js';
import {
  assignmentOwnedByProfessor,
  confirmSubmissionUnified,
  confirmTargetStudent,
  declareGroupSubmission,
  getAssignmentSubmissionStatus,
  getAssignmentSubmissionStatusForProfessor,
  getGroupProgress,
  getStudentProgress,
} from './repository.js';

export async function assignmentStatus(assignmentId, user) {
  const rows = user.role === 'ADMIN'
    ? await getAssignmentSubmissionStatusForProfessor(assignmentId, user.id)
    : await getAssignmentSubmissionStatus(assignmentId, user.id);

  if (!rows.length && (user.role !== 'ADMIN' || !(await assignmentOwnedByProfessor(assignmentId, user.id)))) {
    throw new AppError(
      user.role === 'ADMIN' ? 404 : 403,
      user.role === 'ADMIN' ? 'ASSIGNMENT_NOT_FOUND' : 'NOT_ELIGIBLE',
      user.role === 'ADMIN' ? 'Assignment not found.' : 'You are not eligible for this assignment.'
    );
  }
  return { targets: rows };
}

export async function mySubmission(assignmentId, studentId) {
  const rows = await getAssignmentSubmissionStatus(assignmentId, studentId);
  if (!rows.length) {
    throw new AppError(403, 'NOT_ELIGIBLE', 'You are not eligible for this assignment.');
  }

  const row = rows[0];
  const isGroup = row.target_type === 'GROUP';
  const isConfirmed = Boolean(row.confirmed_at || row.submitted_at);
  const isVerified = row.verification_status === 'VERIFIED';
  const canConfirm = !isConfirmed && (!isGroup || row.can_declare_group_submission);

  return {
    assignmentId: row.assignment_id,
    title: row.title,
    dueAt: row.due_at,
    status: row.assignment_status,
    submissionProvider: row.submission_provider,
    target: {
      type: row.target_type,
      targetId: row.target_id,
      targetStudentId: row.target_student_id,
      groupId: row.group_id,
      groupName: row.group_name,
      isLeader: Boolean(row.can_declare_group_submission),
      isSubmissionAuthority: Boolean(row.is_submission_authority),
    },
    dropboxRequest: {
      url: row.request_url,
      destinationPath: row.destination_path,
    },
    verification: {
      status: row.verification_status ?? 'NOT_SUBMITTED',
      filename: row.verified_filename,
      fileSize: row.verified_file_size ? Number(row.verified_file_size) : null,
      verifiedAt: row.verified_at,
      reviewReason: row.review_reason,
      isLate: Boolean(row.is_late),
    },
    confirmation: {
      isConfirmed,
      confirmedAt: row.submitted_at ?? row.confirmed_at ?? null,
      submittedBy: row.submitted_by,
      canConfirm,
    },
  };
}

export async function confirm(assignmentId, targetStudentId, studentId) {
  return confirmTargetStudent({ assignmentId, targetStudentId, studentId });
}

export async function confirmSubmission(assignmentId, studentId, body = {}) {
  return confirmSubmissionUnified({
    assignmentId,
    studentId,
    targetStudentId: body.targetStudentId,
    targetId: body.targetId,
  });
}

export async function groupSubmit(targetId, studentId) {
  return declareGroupSubmission({ targetId, studentId });
}

export async function studentProgress(studentId) {
  return getStudentProgress(studentId);
}

export async function groupProgress(groupId, studentId) {
  const rows = await getGroupProgress(groupId, studentId);
  if (!rows.length) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this group progress.');
  }
  return { groupId, assignments: rows };
}

export async function assignmentSubmissionsTracker(assignmentId, professorId) {
  const owned = await assignmentOwnedByProfessor(assignmentId, professorId);
  if (!owned) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
  }

  const rows = await getAssignmentSubmissionStatusForProfessor(assignmentId, professorId);

  // Group-aware metrics calculation:
  // For group assignments, each target_id represents a recipient group.
  // For individual assignments, each target_student_id represents a recipient student.
  const recipientMap = new Map();
  for (const r of rows) {
    const key = r.target_type === 'GROUP' ? `group:${r.target_id}` : `student:${r.target_student_id}`;
    if (!recipientMap.has(key)) {
      recipientMap.set(key, r);
    }
  }

  const recipients = [...recipientMap.values()];
  const total = recipients.length;
  let confirmed = 0;
  let verified = 0;
  let pendingVerification = 0;
  let needsReview = 0;
  let rejected = 0;
  let late = 0;
  let onTime = 0;
  let notSubmitted = 0;

  for (const r of recipients) {
    const isConf = Boolean(r.submitted_at || r.confirmed_at);
    if (isConf) {
      confirmed++;
      const confDate = new Date(r.submitted_at || r.confirmed_at);
      const dueDate = new Date(r.due_at);
      if (confDate > dueDate) {
        late++;
      } else {
        onTime++;
      }
    }
    if (r.verification_status === 'VERIFIED') verified++;
    else if (r.verification_status === 'PENDING_VERIFICATION') pendingVerification++;
    else if (r.verification_status === 'NEEDS_REVIEW') needsReview++;
    else if (r.verification_status === 'REJECTED') rejected++;
    else if (!isConf && (!r.verification_status || r.verification_status === 'NOT_SUBMITTED')) notSubmitted++;
  }

  // Construct group trackers if group-targeted
  const groupTrackers = [];
  const groupSeen = new Set();
  for (const r of rows) {
    if (r.target_type === 'GROUP' && !groupSeen.has(r.target_id)) {
      groupSeen.add(r.target_id);
      const isGroupConf = Boolean(r.submitted_at);
      const confDate = r.submitted_at ? new Date(r.submitted_at) : null;
      const dueDate = new Date(r.due_at);
      const isGroupLate = confDate ? confDate > dueDate : (dueDate < new Date());
      groupTrackers.push({
        targetId: r.target_id,
        groupId: r.group_id,
        groupName: r.group_name,
        leaderName: r.leader_name || '—',
        leaderStudentId: r.leader_student_id,
        eligibleMembers: r.eligible_members_count || 0,
        individualConfirmations: r.individual_confirmations_count || 0,
        status: isGroupConf ? 'CONFIRMED' : 'PENDING',
        submittedAt: r.submitted_at,
        isLate: confDate ? confDate > dueDate : false,
        timingStatus: !isGroupConf ? '—' : (confDate > dueDate ? 'Late' : 'On-time'),
      });
    }
  }

  // Construct student trackers if individual-targeted
  const studentTrackers = [];
  for (const r of rows) {
    if (r.target_type === 'STUDENT') {
      const isStudentConf = Boolean(r.confirmed_at);
      const confDate = r.confirmed_at ? new Date(r.confirmed_at) : null;
      const dueDate = new Date(r.due_at);
      studentTrackers.push({
        targetStudentId: r.target_student_id,
        studentId: r.student_id,
        studentName: r.student_name,
        studentEmail: r.student_email,
        studentNumber: r.student_number || r.student_id,
        status: isStudentConf ? 'CONFIRMED' : 'PENDING',
        confirmedAt: r.confirmed_at,
        isLate: confDate ? confDate > dueDate : false,
        timingStatus: !isStudentConf ? '—' : (confDate > dueDate ? 'Late' : 'On-time'),
      });
    }
  }

  return {
    assignmentId,
    summary: {
      totalRecipients: total,
      confirmed,
      pending: total - confirmed,
      completionPercentage: total ? Math.round((confirmed / total) * 100) : 0,
      onTime,
      late,
      verified,
      pendingVerification,
      needsReview,
      rejected,
      notSubmitted,
    },
    groupTrackers,
    studentTrackers,
    submissions: rows,
  };
}
