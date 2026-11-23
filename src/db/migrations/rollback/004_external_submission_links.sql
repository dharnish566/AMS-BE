DROP INDEX IF EXISTS assignment_group_selections_group_idx;
DROP TABLE IF EXISTS assignment_group_selections;
ALTER TABLE assignments
  DROP CONSTRAINT IF EXISTS assignments_submission_url_check,
  DROP CONSTRAINT IF EXISTS assignments_submission_provider_check,
  DROP COLUMN IF EXISTS submission_url,
  DROP COLUMN IF EXISTS submission_provider;
