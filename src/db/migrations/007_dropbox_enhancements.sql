ALTER TABLE dropbox_connections
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

ALTER TABLE submission_verifications
  ADD COLUMN IF NOT EXISTS dropbox_content_hash TEXT;

ALTER TABLE assignment_submission_requests
  ADD COLUMN IF NOT EXISTS dropbox_connection_id UUID REFERENCES users(id) ON DELETE SET NULL;
