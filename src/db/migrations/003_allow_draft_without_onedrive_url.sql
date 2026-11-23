ALTER TABLE assignments
  ALTER COLUMN onedrive_url DROP NOT NULL;

ALTER TABLE assignments
  DROP CONSTRAINT assignments_onedrive_url_check,
  ADD CONSTRAINT assignments_onedrive_url_check CHECK (
    onedrive_url IS NULL
    OR onedrive_url ~* '^https://([a-z0-9-]+\\.)*(microsoft\\.com|sharepoint\\.com)/'
    OR onedrive_url ~* '^https://(onedrive\\.live\\.com|1drv\\.ms)/'
  );
