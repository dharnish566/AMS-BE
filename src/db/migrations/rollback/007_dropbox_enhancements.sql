ALTER TABLE assignment_submission_requests
  DROP COLUMN IF EXISTS dropbox_connection_id;

ALTER TABLE submission_verifications
  DROP COLUMN IF EXISTS dropbox_content_hash;

ALTER TABLE dropbox_connections
  DROP COLUMN IF EXISTS last_sync_at,
  DROP COLUMN IF EXISTS last_refreshed_at;
