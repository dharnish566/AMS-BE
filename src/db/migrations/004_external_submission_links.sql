CREATE TABLE IF NOT EXISTS assignment_group_selections (
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  PRIMARY KEY (assignment_id, group_id)
);

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS submission_provider TEXT,
  ADD COLUMN IF NOT EXISTS submission_url TEXT;

UPDATE assignments
SET submission_provider = 'ONEDRIVE',
    submission_url = onedrive_url
WHERE submission_provider IS NULL;

ALTER TABLE assignments
  ALTER COLUMN submission_provider SET DEFAULT 'ONEDRIVE';

UPDATE assignments
SET submission_provider = 'ONEDRIVE'
WHERE submission_provider IS NULL;

ALTER TABLE assignments
  ALTER COLUMN submission_provider SET NOT NULL;

ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_submission_provider_check,
  ADD CONSTRAINT assignments_submission_provider_check
    CHECK (submission_provider IN ('ONEDRIVE', 'DROPBOX'));

ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_submission_url_check,
  ADD CONSTRAINT assignments_submission_url_check CHECK (
    submission_url IS NULL
    OR submission_url ~* '^https://.*(onedrive.live.com|1drv.ms)/'
    OR submission_url ~* '^https://.*(microsoft.com|sharepoint.com)/'
    OR submission_url ~* '^https://.*dropbox.com/'
  );

CREATE INDEX IF NOT EXISTS assignment_group_selections_group_idx
  ON assignment_group_selections (group_id);
