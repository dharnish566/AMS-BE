import { pool } from '../../config/database.js';

export async function saveOAuthState({ stateHash, professorId, encryptedCodeVerifier, expiresAt }) {
  await pool.query(
    `INSERT INTO dropbox_oauth_states (state_hash, professor_id, encrypted_code_verifier, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (state_hash) DO UPDATE
     SET professor_id = EXCLUDED.professor_id,
         encrypted_code_verifier = EXCLUDED.encrypted_code_verifier,
         expires_at = EXCLUDED.expires_at,
         created_at = NOW()`,
    [stateHash, professorId, encryptedCodeVerifier, expiresAt]
  );
}

export async function consumeOAuthState(stateHash) {
  const result = await pool.query(
    `DELETE FROM dropbox_oauth_states
     WHERE state_hash = $1 AND expires_at > NOW()
     RETURNING professor_id, encrypted_code_verifier`,
    [stateHash]
  );
  return result.rows[0] ?? null;
}

export async function getConnection(professorId) {
  const result = await pool.query(
    `SELECT * FROM dropbox_connections WHERE professor_id = $1`,
    [professorId]
  );
  return result.rows[0] ?? null;
}

export async function saveConnection({ professorId, account, encryptedRefreshToken, scopes }) {
  const result = await pool.query(
    `INSERT INTO dropbox_connections (
       professor_id, account_id, account_name, account_email,
       encrypted_refresh_token, scopes, status, last_refreshed_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'CONNECTED', NOW(), NOW())
     ON CONFLICT (professor_id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       account_name = EXCLUDED.account_name,
       account_email = EXCLUDED.account_email,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       scopes = EXCLUDED.scopes,
       status = 'CONNECTED',
       last_refreshed_at = NOW(),
       updated_at = NOW()
     RETURNING professor_id, account_id, account_name, account_email, scopes, status, last_refreshed_at, last_sync_at, updated_at`,
    [professorId, account.account_id, account.name?.display_name ?? null, account.email ?? null, encryptedRefreshToken, scopes ?? []]
  );
  return result.rows[0];
}

export async function markConnectionStatus(professorId, status) {
  await pool.query(
    `UPDATE dropbox_connections SET status = $2, updated_at = NOW() WHERE professor_id = $1`,
    [professorId, status]
  );
}

export async function updateLastSync(professorId) {
  await pool.query(
    `UPDATE dropbox_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE professor_id = $1`,
    [professorId]
  );
}

export async function disconnect(professorId) {
  await pool.query(
    `UPDATE dropbox_connections
     SET status = 'DISCONNECTED', encrypted_refresh_token = '', updated_at = NOW()
     WHERE professor_id = $1`,
    [professorId]
  );
}

export async function getRequest(assignmentId, recipientType, recipientId) {
  const result = await pool.query(
    `SELECT * FROM assignment_submission_requests
     WHERE assignment_id = $1 AND recipient_type = $2 AND recipient_id = $3`,
    [assignmentId, recipientType, recipientId]
  );
  return result.rows[0] ?? null;
}

export async function saveRequest({ assignmentId, recipientType, recipientId, requestId, requestUrl, destinationPath, dropboxConnectionId }) {
  const result = await pool.query(
    `INSERT INTO assignment_submission_requests (
       assignment_id, recipient_type, recipient_id, dropbox_request_id,
       request_url, destination_path, dropbox_connection_id, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
     ON CONFLICT (assignment_id, recipient_type, recipient_id) DO UPDATE SET
       dropbox_request_id = EXCLUDED.dropbox_request_id,
       request_url = EXCLUDED.request_url,
       destination_path = EXCLUDED.destination_path,
       dropbox_connection_id = EXCLUDED.dropbox_connection_id,
       status = 'OPEN',
       updated_at = NOW()
     RETURNING *`,
    [assignmentId, recipientType, recipientId, requestId, requestUrl, destinationPath, dropboxConnectionId ?? null]
  );
  return result.rows[0];
}

export async function listAssignmentRecipients(assignmentId) {
  const result = await pool.query(
    `SELECT
       at.id AS target_id,
       at.target_type,
       at.group_id,
       at.student_id AS target_student_user_id,
       g.name AS group_name,
       ts.id AS target_student_id,
       ts.student_id AS student_user_id,
       student.full_name AS student_name,
       student.email AS student_email
     FROM assignment_targets at
     LEFT JOIN groups g ON g.id = at.group_id
     LEFT JOIN target_students ts ON ts.target_id = at.id
     LEFT JOIN users student ON student.id = ts.student_id
     WHERE at.assignment_id = $1
     ORDER BY at.target_type, g.name, student.full_name`,
    [assignmentId]
  );
  return result.rows;
}

export async function getTargetForStudent(assignmentId, studentId) {
  const result = await pool.query(
    `SELECT
       at.id AS target_id,
       at.target_type,
       at.group_id,
       g.name AS group_name,
       g.leader_id,
       ts.id AS target_student_id,
       a.id AS assignment_id,
       a.due_at,
       a.title,
       a.status,
       a.submission_provider
     FROM assignments a
     JOIN assignment_targets at ON at.assignment_id = a.id
     JOIN target_students ts ON ts.target_id = at.id
     LEFT JOIN groups g ON g.id = at.group_id
     WHERE a.id = $1 AND ts.student_id = $2 AND a.status = 'PUBLISHED'`,
    [assignmentId, studentId]
  );
  return result.rows[0] ?? null;
}

export async function getTargetById(targetId) {
  const result = await pool.query(
    `SELECT at.id AS target_id, at.assignment_id, at.target_type, at.group_id, a.due_at, a.status, g.leader_id
     FROM assignment_targets at
     JOIN assignments a ON a.id = at.assignment_id
     LEFT JOIN groups g ON g.id = at.group_id
     WHERE at.id = $1`,
    [targetId]
  );
  return result.rows[0] ?? null;
}

export async function getVerification({ assignmentId, targetId, targetStudentId }) {
  const result = await pool.query(
    `SELECT * FROM submission_verifications
     WHERE assignment_id = $1
       AND (
         (target_id = $2 AND $2::uuid IS NOT NULL AND target_student_id IS NULL)
         OR (target_student_id = $3 AND $3::uuid IS NOT NULL)
       )
     ORDER BY updated_at DESC
     LIMIT 1`,
    [assignmentId, targetId ?? null, targetStudentId ?? null]
  );
  return result.rows[0] ?? null;
}

export async function upsertVerification(data, actorId, eventType, client = pool) {
  const fields = [
    data.assignmentId,
    data.targetId ?? null,
    data.targetStudentId ?? null,
    data.status,
    data.dropboxFileId ?? null,
    data.dropboxFileRevision ?? null,
    data.filename ?? null,
    data.fileSize ?? null,
    data.filePath ?? null,
    data.clientModifiedAt ?? null,
    data.serverModifiedAt ?? null,
    data.verificationMethod ?? null,
    data.reviewReason ?? null,
    data.verifiedAt ?? null,
    data.confirmedAt ?? null,
    data.isLate ?? false,
    data.dropboxContentHash ?? null,
  ];

  const conflictTarget = data.targetStudentId
    ? '(assignment_id, target_student_id) WHERE target_student_id IS NOT NULL'
    : '(assignment_id, target_id) WHERE target_id IS NOT NULL AND target_student_id IS NULL';

  const result = await client.query(
    `INSERT INTO submission_verifications (
       assignment_id, target_id, target_student_id, status,
       dropbox_file_id, dropbox_file_revision, filename, file_size, file_path,
       client_modified_at, server_modified_at, verification_method, review_reason,
       verified_at, confirmed_at, is_late, dropbox_content_hash
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT ${conflictTarget} DO UPDATE SET
       status = EXCLUDED.status,
       dropbox_file_id = EXCLUDED.dropbox_file_id,
       dropbox_file_revision = EXCLUDED.dropbox_file_revision,
       filename = EXCLUDED.filename,
       file_size = EXCLUDED.file_size,
       file_path = EXCLUDED.file_path,
       client_modified_at = EXCLUDED.client_modified_at,
       server_modified_at = EXCLUDED.server_modified_at,
       verification_method = EXCLUDED.verification_method,
       review_reason = EXCLUDED.review_reason,
       verified_at = EXCLUDED.verified_at,
       confirmed_at = COALESCE(EXCLUDED.confirmed_at, submission_verifications.confirmed_at),
       is_late = EXCLUDED.is_late,
       dropbox_content_hash = EXCLUDED.dropbox_content_hash,
       updated_at = NOW()
     RETURNING *`,
    fields
  );

  const row = result.rows[0];

  await client.query(
    `INSERT INTO submission_verification_events (
       verification_id, assignment_id, actor_id, event_type, status, reason, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.id,
      data.assignmentId,
      actorId ?? null,
      eventType,
      row.status,
      data.reviewReason ?? null,
      JSON.stringify({
        fileId: row.dropbox_file_id,
        filename: row.filename,
        fileSize: row.file_size,
        method: row.verification_method,
      }),
    ]
  );

  return row;
}

export async function markVerifiedConfirmed({ assignmentId, targetId, targetStudentId, confirmedAt }) {
  const result = await pool.query(
    `UPDATE submission_verifications
     SET status = 'CONFIRMED', confirmed_at = $4, updated_at = NOW()
     WHERE assignment_id = $1
       AND (
         (target_id = $2 AND $2::uuid IS NOT NULL AND target_student_id IS NULL)
         OR (target_student_id = $3 AND $3::uuid IS NOT NULL)
       )
       AND status = 'VERIFIED'
     RETURNING *`,
    [assignmentId, targetId ?? null, targetStudentId ?? null, confirmedAt]
  );
  return result.rows[0] ?? null;
}

export async function fileAlreadyClaimed(fileId, verificationId) {
  if (!fileId) return false;
  const result = await pool.query(
    `SELECT 1 FROM submission_verifications
     WHERE dropbox_file_id = $1
       AND id <> $2
       AND status IN ('VERIFIED', 'CONFIRMED')`,
    [fileId, verificationId ?? '00000000-0000-0000-0000-000000000000']
  );
  return result.rowCount > 0;
}

export async function getVerificationById(verificationId, assignmentId) {
  const result = await pool.query(
    `SELECT * FROM submission_verifications WHERE id = $1 AND assignment_id = $2`,
    [verificationId, assignmentId]
  );
  return result.rows[0] ?? null;
}

export async function reviewVerification({ verificationId, assignmentId, status, reason, actorId }) {
  const result = await pool.query(
    `UPDATE submission_verifications
     SET status = $3,
         review_reason = $4,
         verified_at = CASE WHEN $3 = 'VERIFIED' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
         updated_at = NOW()
     WHERE id = $1 AND assignment_id = $2 AND status = 'NEEDS_REVIEW'
     RETURNING *`,
    [verificationId, assignmentId, status, reason ?? null]
  );
  const row = result.rows[0];
  if (!row) return null;

  await client.query(
    `INSERT INTO submission_verification_events (
       verification_id, assignment_id, actor_id, event_type, status, reason
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, assignmentId, actorId, status === 'VERIFIED' ? 'MANUAL_APPROVAL' : 'MANUAL_REJECTION', status, reason ?? null]
  );

  return row;
}

export async function listActiveRequestsForSync() {
  const result = await pool.query(
    `SELECT
       sr.id AS request_id,
       sr.assignment_id,
       sr.recipient_type,
       sr.recipient_id,
       sr.dropbox_request_id,
       sr.request_url,
       sr.destination_path,
       a.professor_id,
       a.due_at,
       a.title AS assignment_title,
       sv.id AS verification_id,
       sv.status AS current_verification_status
     FROM assignment_submission_requests sr
     JOIN assignments a ON a.id = sr.assignment_id
     LEFT JOIN submission_verifications sv ON sv.assignment_id = sr.assignment_id
       AND (
         (sr.recipient_type = 'STUDENT' AND sv.target_student_id = sr.recipient_id)
         OR (sr.recipient_type = 'GROUP' AND sv.target_id IN (SELECT id FROM assignment_targets WHERE assignment_id = a.id AND group_id = sr.recipient_id))
       )
     WHERE sr.status = 'OPEN' AND a.status = 'PUBLISHED'
     LIMIT 50`
  );
  return result.rows;
}
