import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/appError.js';
import { findAssignmentForUser } from '../assignments/repository.js';
import { authorizationUrl, dropboxApi, exchangeCode, listFolderAll, refreshAccessToken } from './client.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import * as repository from './repository.js';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.txt', '.zip', '.tar', '.gz', '.7z', '.jpg', '.jpeg', '.png',
]);

function ensureEnabled() {
  if (!env.dropboxIntegrationEnabled) {
    throw new AppError(503, 'DROPBOX_INTEGRATION_DISABLED', 'Dropbox integration is disabled by administrator.');
  }
  if (!env.dropboxAppKey || !env.dropboxAppSecret || !env.dropboxRedirectUri) {
    throw new AppError(503, 'DROPBOX_NOT_CONFIGURED', 'Dropbox application credentials are not configured.');
  }
  if (!env.dropboxTokenEncryptionKey) {
    throw new AppError(503, 'DROPBOX_NOT_CONFIGURED', 'Dropbox token encryption is not configured.');
  }
}

function safeSegment(value) {
  return String(value ?? 'recipient')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'recipient';
}

function hashState(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function startOAuth(professorId) {
  ensureEnabled();
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  await repository.saveOAuthState({
    stateHash: hashState(state),
    professorId,
    encryptedCodeVerifier: encryptSecret(verifier),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  return authorizationUrl({
    appKey: env.dropboxAppKey,
    redirectUri: env.dropboxRedirectUri,
    state,
    codeChallenge: challenge,
  });
}

export async function finishOAuth({ code, state }) {
  ensureEnabled();
  if (!code || !state) {
    throw new AppError(400, 'DROPBOX_OAUTH_INVALID', 'Dropbox authorization did not return a valid code.');
  }

  const stored = await repository.consumeOAuthState(hashState(state));
  if (!stored) {
    throw new AppError(400, 'DROPBOX_OAUTH_STATE_INVALID', 'Dropbox authorization expired or was already used.');
  }

  const token = await exchangeCode({
    appKey: env.dropboxAppKey,
    appSecret: env.dropboxAppSecret,
    redirectUri: env.dropboxRedirectUri,
    code,
    codeVerifier: decryptSecret(stored.encrypted_code_verifier),
  });

  if (!token.refresh_token) {
    throw new AppError(502, 'DROPBOX_REFRESH_TOKEN_MISSING', 'Dropbox did not issue a refresh token. Reconnect with offline access enabled.');
  }

  const account = await dropboxApi.account(token.access_token);
  return repository.saveConnection({
    professorId: stored.professor_id,
    account,
    encryptedRefreshToken: encryptSecret(token.refresh_token),
    scopes: token.scope ? String(token.scope).split(/[ ,]+/) : [],
  });
}

export async function connectionStatus(professorId) {
  const connection = await repository.getConnection(professorId);
  return connection
    ? {
        connected: connection.status === 'CONNECTED',
        account: {
          id: connection.account_id,
          name: connection.account_name,
          email: connection.account_email,
        },
        status: connection.status,
        scopes: connection.scopes,
        lastRefreshedAt: connection.last_refreshed_at,
        lastSyncAt: connection.last_sync_at,
        updatedAt: connection.updated_at,
      }
    : { connected: false, status: 'DISCONNECTED' };
}

export async function disconnect(professorId) {
  const connection = await repository.getConnection(professorId);
  if (connection?.encrypted_refresh_token) {
    try {
      const token = await refreshAccessToken({
        appKey: env.dropboxAppKey,
        appSecret: env.dropboxAppSecret,
        refreshToken: decryptSecret(connection.encrypted_refresh_token),
      });
      if (token.access_token) {
        await dropboxApi.revokeToken(token.access_token);
      }
    } catch {
      // Ignore token revocation failure
    }
  }
  await repository.disconnect(professorId);
  return { connected: false, status: 'DISCONNECTED' };
}

export async function accessToken(professorId) {
  ensureEnabled();
  const connection = await repository.getConnection(professorId);
  if (!connection || connection.status !== 'CONNECTED' || !connection.encrypted_refresh_token) {
    throw new AppError(409, 'DROPBOX_CONNECTION_REQUIRED', 'Connect Dropbox before using Dropbox submissions.');
  }

  try {
    const token = await refreshAccessToken({
      appKey: env.dropboxAppKey,
      appSecret: env.dropboxAppSecret,
      refreshToken: decryptSecret(connection.encrypted_refresh_token),
    });
    return token.access_token;
  } catch (error) {
    if (error.code === 'DROPBOX_REAUTH_REQUIRED') {
      await repository.markConnectionStatus(professorId, 'REAUTH_REQUIRED');
    }
    throw error;
  }
}

export async function createAssignmentRequests({ assignment, professorId }) {
  if (assignment.submission_provider !== 'DROPBOX') return [];
  const token = await accessToken(professorId);
  const recipients = await repository.listAssignmentRecipients(assignment.id);
  const unique = new Map();
  const results = [];

  for (const row of recipients) {
    const recipientType = row.target_type === 'GROUP' ? 'GROUP' : 'STUDENT';
    const recipientId = recipientType === 'GROUP' ? row.group_id : row.student_user_id;

    if (!recipientId) continue;
    const key = `${recipientType}:${recipientId}`;
    if (unique.has(key)) continue;
    unique.set(key, true);

    const existing = await repository.getRequest(assignment.id, recipientType, recipientId);
    if (existing) {
      results.push(existing);
      continue;
    }

    const label = recipientType === 'GROUP'
      ? `Group-${safeSegment(row.group_name || row.group_id)}`
      : `Student-${safeSegment(row.student_name || recipientId)}`;
    const destinationPath = `/Assignments/Assignment-${assignment.id}/${label}`;

    const created = await dropboxApi.createRequest(token, {
      title: `${assignment.title} - ${label}`,
      destination: destinationPath,
      open: true,
      description: 'Upload your assignment through this Joineazy File Request.',
    });

    const saved = await repository.saveRequest({
      assignmentId: assignment.id,
      recipientType,
      recipientId,
      requestId: created.id,
      requestUrl: created.url,
      destinationPath,
      dropboxConnectionId: professorId,
    });
    results.push(saved);
  }

  return results;
}

export async function requestForStudent(assignmentId, studentId) {
  const target = await repository.getTargetForStudent(assignmentId, studentId);
  if (!target) {
    throw new AppError(403, 'NOT_ELIGIBLE', 'You are not assigned to this assignment.');
  }

  const recipientType = target.target_type === 'GROUP' ? 'GROUP' : 'STUDENT';
  const recipientId = target.target_type === 'GROUP' ? target.group_id : studentId;
  const request = await repository.getRequest(assignmentId, recipientType, recipientId);

  return { target, request };
}

export async function verifyUpload({ assignmentId, studentId }) {
  const { target, request } = await requestForStudent(assignmentId, studentId);
  if (!request) {
    throw new AppError(409, 'DROPBOX_REQUEST_UNAVAILABLE', 'The Dropbox upload request is not available yet. Please contact your professor.');
  }
  if (request.status === 'CLOSED') {
    throw new AppError(409, 'DROPBOX_REQUEST_CLOSED', 'This Dropbox upload request is closed.');
  }

  const assignment = await findAssignmentForUser(assignmentId, { role: 'STUDENT', userId: studentId });
  if (!assignment) {
    throw new AppError(403, 'NOT_ELIGIBLE', 'You are not assigned to this assignment.');
  }

  let token;
  try {
    token = await accessToken(assignment.professor_id);
  } catch (error) {
    const isTemp = error.statusCode === 502 || error.statusCode === 503 || error.statusCode === 429;
    if (isTemp) {
      return repository.upsertVerification(
        {
          assignmentId,
          targetId: target.target_type === 'GROUP' ? target.target_id : null,
          targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
          status: 'PENDING_VERIFICATION',
          verificationMethod: 'DROPBOX_REQUEST_DESTINATION',
          reviewReason: 'Dropbox verification is temporarily unavailable. Try again.',
          isLate: false,
        },
        studentId,
        'VERIFICATION_TEMPORARILY_UNAVAILABLE'
      );
    }
    throw error;
  }

  // Try to list files with a few retries to allow Dropbox folder creation propagation
  const MAX_ATTEMPTS = 3;
  let entries = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      entries = (await listFolderAll(token, request.destination_path)).filter(
        (e) => e['.tag'] === 'file'
      );
      if (entries.length) break; // found files
    } catch (error) {
      const isTemp = error.statusCode === 502 || error.statusCode === 503 || error.statusCode === 429;
      if (isTemp) {
        return repository.upsertVerification(
          {
            assignmentId,
            targetId: target.target_type === 'GROUP' ? target.target_id : null,
            targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
            status: 'PENDING_VERIFICATION',
            verificationMethod: 'DROPBOX_REQUEST_DESTINATION',
            reviewReason: 'Dropbox verification is temporarily unavailable. Try again.',
            isLate: false,
          },
          studentId,
          'VERIFICATION_TEMPORARILY_UNAVAILABLE'
        );
      }
      throw error;
    }
    // wait before next attempt (exponential back‑off)
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }

  const existing = await repository.getVerification({
    assignmentId,
    targetId: target.target_type === 'GROUP' ? target.target_id : null,
    targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
  });

  // No files uploaded yet
  if (!entries.length) {
    return repository.upsertVerification(
      {
        assignmentId,
        targetId: target.target_type === 'GROUP' ? target.target_id : null,
        targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
        status: 'NOT_SUBMITTED',
        verificationMethod: 'DROPBOX_REQUEST_DESTINATION',
        reviewReason: 'No uploaded file was found. Complete your Dropbox upload before verifying.',
        isLate: false,
      },
      studentId,
      'VERIFICATION_NOT_FOUND'
    );
  }

  // Check file policy on found entries
  const valid = entries.filter((entry) => {
    const size = Number(entry.size ?? 0);
    const ext = (entry.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
    return size > 0 && ALLOWED_EXTENSIONS.has(ext);
  });

  const now = new Date();

  // If there are files but none meet policy (empty or bad extension)
  if (!valid.length) {
    const anyEmpty = entries.some((e) => Number(e.size ?? 0) === 0);
    const reason = anyEmpty
      ? 'The uploaded file is empty (0 bytes). Please upload a valid non-empty file.'
      : 'The uploaded file has an unsupported file format.';
    return repository.upsertVerification(
      {
        assignmentId,
        targetId: target.target_type === 'GROUP' ? target.target_id : null,
        targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
        status: 'REJECTED',
        verificationMethod: 'DROPBOX_REQUEST_DESTINATION',
        reviewReason: reason,
        isLate: false,
      },
      studentId,
      'FILE_POLICY_REJECTED'
    );
  }

  // If multiple valid files exist, flag for review
  if (valid.length > 1) {
    const late = valid.some((entry) => new Date(entry.server_modified ?? entry.client_modified ?? now) > new Date(target.due_at));
    return repository.upsertVerification(
      {
        assignmentId,
        targetId: target.target_type === 'GROUP' ? target.target_id : null,
        targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
        status: 'NEEDS_REVIEW',
        verificationMethod: 'DROPBOX_REQUEST_DESTINATION',
        reviewReason: 'Multiple valid files were found in the recipient folder. Professor review required.',
        isLate: late,
      },
      studentId,
      'AMBIGUOUS_MULTIPLE_FILES'
    );
  }

  const file = valid[0];
  const fileTimestamp = file.server_modified ?? file.client_modified ?? now;
  const isLate = new Date(fileTimestamp) > new Date(target.due_at);

  // Check if file is claimed elsewhere
  if (await repository.fileAlreadyClaimed(file.id, existing?.id)) {
    return repository.upsertVerification(
      {
        assignmentId,
        targetId: target.target_type === 'GROUP' ? target.target_id : null,
        targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
        status: 'NEEDS_REVIEW',
        dropboxFileId: file.id,
        dropboxFileRevision: file.rev,
        filename: file.name,
        fileSize: file.size,
        filePath: file.path_display,
        clientModifiedAt: file.client_modified,
        serverModifiedAt: file.server_modified,
        dropboxContentHash: file.content_hash,
        verificationMethod: 'DROPBOX_REQUEST_DESTINATION',
        reviewReason: 'This Dropbox file is already claimed by another submission.',
        isLate,
      },
      studentId,
      'DUPLICATE_FILE_CLAIM'
    );
  }

  // Exactly one valid, unclaimed file matching all acceptance rules
  return repository.upsertVerification(
    {
      assignmentId,
      targetId: target.target_type === 'GROUP' ? target.target_id : null,
      targetStudentId: target.target_type === 'STUDENT' ? target.target_student_id : null,
      status: 'VERIFIED',
      dropboxFileId: file.id,
      dropboxFileRevision: file.rev,
      filename: file.name,
      fileSize: file.size,
      filePath: file.path_display,
      clientModifiedAt: file.client_modified,
      serverModifiedAt: file.server_modified,
      dropboxContentHash: file.content_hash,
      verificationMethod: 'DROPBOX_REQUEST_DESTINATION',
      isLate,
      verifiedAt: now,
    },
    studentId,
    'FILE_MATCHED'
  );
}

export async function reviewAssignmentSubmission({ assignmentId, verificationId, professorId, decision, reason }) {
  const assignment = await findAssignmentForUser(assignmentId, { role: 'ADMIN', userId: professorId });
  if (!assignment) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
  }
  if (!['VERIFIED', 'REJECTED'].includes(decision)) {
    throw new AppError(400, 'INVALID_REVIEW', 'Review decision must be VERIFIED or REJECTED.');
  }
  if (decision === 'REJECTED' && !reason?.trim()) {
    throw new AppError(400, 'REVIEW_REASON_REQUIRED', 'A reason is required when rejecting a submission.');
  }

  const row = await repository.reviewVerification({
    assignmentId,
    verificationId,
    status: decision,
    reason,
    actorId: professorId,
  });

  if (!row) {
    throw new AppError(409, 'REVIEW_NOT_AVAILABLE', 'This submission is no longer waiting for review.');
  }
  return row;
}
