import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { accessToken, listFolderAll } from './client.js';
import * as repository from './repository.js';

const SYNC_ADVISORY_LOCK_ID = 982347102;
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.txt', '.zip', '.tar', '.gz', '.7z', '.jpg', '.jpeg', '.png',
]);

export async function runDropboxSync() {
  if (!env.dropboxIntegrationEnabled) {
    return { status: 'skipped', reason: 'Dropbox integration disabled' };
  }

  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [SYNC_ADVISORY_LOCK_ID]);
    lockAcquired = Boolean(lockResult.rows[0]?.acquired);
    if (!lockAcquired) {
      return { status: 'busy', reason: 'Sync already running on another worker' };
    }

    const openRequests = await repository.listActiveRequestsForSync();
    if (!openRequests.length) {
      return { status: 'ok', processed: 0, updated: 0 };
    }

    // Group requests by professor to batch access token refreshes
    const requestsByProfessor = new Map();
    for (const req of openRequests) {
      const list = requestsByProfessor.get(req.professor_id) || [];
      list.push(req);
      requestsByProfessor.set(req.professor_id, list);
    }

    let processedCount = 0;
    let updatedCount = 0;

    for (const [professorId, requests] of requestsByProfessor.entries()) {
      let token;
      try {
        const { connectionStatus, accessToken: getAccessToken } = await import('./service.js');
        const conn = await connectionStatus(professorId);
        if (!conn.connected) continue;
        token = await getAccessToken(professorId);
      } catch (err) {
        console.warn(`[DropboxSync] Could not obtain token for professor ${professorId}:`, err.message);
        continue;
      }

      for (const req of requests) {
        processedCount++;
        try {
          const entries = (await listFolderAll(token, req.destination_path)).filter(
            (e) => e['.tag'] === 'file'
          );

          const valid = entries.filter((entry) => {
            const size = Number(entry.size ?? 0);
            const ext = (entry.name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
            return size > 0 && ALLOWED_EXTENSIONS.has(ext);
          });

          const now = new Date();
          const targetStudentId = req.recipient_type === 'STUDENT' ? req.recipient_id : null;

          // Resolve target_id for group targets
          let targetId = null;
          if (req.recipient_type === 'GROUP') {
            const tRes = await pool.query(
              'SELECT id FROM assignment_targets WHERE assignment_id = $1 AND group_id = $2',
              [req.assignment_id, req.recipient_id]
            );
            targetId = tRes.rows[0]?.id ?? null;
          }

          if (!valid.length) {
            if (entries.length > 0) {
              // Files present but empty or invalid extension
              await repository.upsertVerification(
                {
                  assignmentId: req.assignment_id,
                  targetId,
                  targetStudentId,
                  status: 'REJECTED',
                  verificationMethod: 'BACKGROUND_SYNC',
                  reviewReason: 'Uploaded file does not meet file format or size policy.',
                  isLate: false,
                },
                professorId,
                'BACKGROUND_SYNC_REJECTED'
              );
              updatedCount++;
            }
            continue;
          }

          if (valid.length > 1) {
            const late = valid.some((e) => new Date(e.server_modified ?? e.client_modified ?? now) > new Date(req.due_at));
            await repository.upsertVerification(
              {
                assignmentId: req.assignment_id,
                targetId,
                targetStudentId,
                status: 'NEEDS_REVIEW',
                verificationMethod: 'BACKGROUND_SYNC',
                reviewReason: 'Multiple valid files detected in folder during background sync.',
                isLate: late,
              },
              professorId,
              'BACKGROUND_SYNC_AMBIGUOUS'
            );
            updatedCount++;
            continue;
          }

          const file = valid[0];
          const isLate = new Date(file.server_modified ?? file.client_modified ?? now) > new Date(req.due_at);

          if (await repository.fileAlreadyClaimed(file.id, req.verification_id)) {
            await repository.upsertVerification(
              {
                assignmentId: req.assignment_id,
                targetId,
                targetStudentId,
                status: 'NEEDS_REVIEW',
                dropboxFileId: file.id,
                dropboxFileRevision: file.rev,
                filename: file.name,
                fileSize: file.size,
                filePath: file.path_display,
                clientModifiedAt: file.client_modified,
                serverModifiedAt: file.server_modified,
                dropboxContentHash: file.content_hash,
                verificationMethod: 'BACKGROUND_SYNC',
                reviewReason: 'This Dropbox file is already claimed by another submission.',
                isLate,
              },
              professorId,
              'BACKGROUND_SYNC_DUPLICATE_CLAIM'
            );
            updatedCount++;
            continue;
          }

          // Single valid match
          await repository.upsertVerification(
            {
              assignmentId: req.assignment_id,
              targetId,
              targetStudentId,
              status: 'VERIFIED',
              dropboxFileId: file.id,
              dropboxFileRevision: file.rev,
              filename: file.name,
              fileSize: file.size,
              filePath: file.path_display,
              clientModifiedAt: file.client_modified,
              serverModifiedAt: file.server_modified,
              dropboxContentHash: file.content_hash,
              verificationMethod: 'BACKGROUND_SYNC',
              isLate,
              verifiedAt: now,
            },
            professorId,
            'BACKGROUND_SYNC_MATCHED'
          );
          updatedCount++;
        } catch (itemErr) {
          if (itemErr.statusCode === 429) {
            // Dropbox rate limit hit, break out of this professor's requests
            console.warn('[DropboxSync] Rate limited by Dropbox API.');
            break;
          }
          console.warn(`[DropboxSync] Error checking request ${req.request_id}:`, itemErr.message);
        }
      }

      await repository.updateLastSync(professorId);
    }

    return { status: 'ok', processed: processedCount, updated: updatedCount };
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [SYNC_ADVISORY_LOCK_ID]).catch(() => {});
    }
    client.release();
  }
}
