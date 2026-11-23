ALTER TABLE submission_verifications
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false;
