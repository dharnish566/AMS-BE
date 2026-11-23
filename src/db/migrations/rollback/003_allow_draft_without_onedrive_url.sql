DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM assignments WHERE onedrive_url IS NULL) THEN
    RAISE EXCEPTION 'Cannot roll back while draft assignments have no OneDrive URL';
  END IF;
  ALTER TABLE assignments
    ALTER COLUMN onedrive_url SET NOT NULL;
END $$;
