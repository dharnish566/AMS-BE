CREATE TABLE IF NOT EXISTS dropbox_connections (
  professor_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  account_name TEXT,
  account_email TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dropbox_oauth_states (
  state_hash TEXT PRIMARY KEY,
  professor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_code_verifier TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submission_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('STUDENT', 'GROUP')),
  recipient_id UUID NOT NULL,
  dropbox_request_id TEXT NOT NULL,
  request_url TEXT NOT NULL,
  destination_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'ERROR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, recipient_type, recipient_id),
  UNIQUE (dropbox_request_id)
);

CREATE INDEX IF NOT EXISTS assignment_submission_requests_recipient_idx
  ON assignment_submission_requests (recipient_type, recipient_id);

CREATE TABLE IF NOT EXISTS submission_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  target_id UUID REFERENCES assignment_targets(id) ON DELETE CASCADE,
  target_student_id UUID REFERENCES target_students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('NOT_SUBMITTED', 'PENDING_VERIFICATION', 'VERIFIED', 'NEEDS_REVIEW', 'CONFIRMED', 'REJECTED')),
  dropbox_file_id TEXT,
  dropbox_file_revision TEXT,
  filename TEXT,
  file_size BIGINT,
  file_path TEXT,
  client_modified_at TIMESTAMPTZ,
  server_modified_at TIMESTAMPTZ,
  verification_method TEXT,
  review_reason TEXT,
  verified_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (target_id IS NOT NULL OR target_student_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS submission_verifications_target_student_unique
  ON submission_verifications (assignment_id, target_student_id)
  WHERE target_student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS submission_verifications_target_unique
  ON submission_verifications (assignment_id, target_id)
  WHERE target_id IS NOT NULL AND target_student_id IS NULL;

CREATE TABLE IF NOT EXISTS submission_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id UUID REFERENCES submission_verifications(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  status TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
