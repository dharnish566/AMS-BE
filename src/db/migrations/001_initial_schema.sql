CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 160),
  email CITEXT NOT NULL UNIQUE,
  student_id TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  leader_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX group_members_one_active_student
  ON group_members (student_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX group_members_one_active_pair
  ON group_members (group_id, student_id) WHERE status = 'ACTIVE';
CREATE INDEX group_members_group_idx ON group_members (group_id);
CREATE INDEX group_members_student_idx ON group_members (student_id);

CREATE TABLE group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CHECK ((status = 'PENDING' AND responded_at IS NULL) OR (status <> 'PENDING' AND responded_at IS NOT NULL))
);
CREATE UNIQUE INDEX group_invitations_one_pending
  ON group_invitations (group_id, invitee_id) WHERE status = 'PENDING';
CREATE INDEX group_invitations_invitee_idx ON group_invitations (invitee_id);
CREATE INDEX group_invitations_group_idx ON group_invitations (group_id);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 10_000),
  onedrive_url TEXT NOT NULL CHECK (onedrive_url ~* '^https://([a-z0-9-]+\.)*microsoft\.com/|^https://onedrive\.live\.com/'),
  due_at TIMESTAMPTZ NOT NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('ALL_STUDENTS', 'SELECTED_GROUPS')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX assignments_professor_idx ON assignments (professor_id);
CREATE INDEX assignments_status_due_idx ON assignments (status, due_at);

CREATE TABLE assignment_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('GROUP', 'STUDENT')),
  group_id UUID REFERENCES groups(id) ON DELETE RESTRICT,
  student_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((target_type = 'GROUP' AND group_id IS NOT NULL AND student_id IS NULL)
    OR (target_type = 'STUDENT' AND student_id IS NOT NULL AND group_id IS NULL))
);
CREATE UNIQUE INDEX assignment_targets_group_unique
  ON assignment_targets (assignment_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX assignment_targets_student_unique
  ON assignment_targets (assignment_id, student_id) WHERE student_id IS NOT NULL;
CREATE INDEX assignment_targets_assignment_idx ON assignment_targets (assignment_id);
CREATE INDEX assignment_targets_group_idx ON assignment_targets (group_id);
CREATE INDEX assignment_targets_student_idx ON assignment_targets (student_id);

CREATE TABLE target_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES assignment_targets(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (target_id, student_id)
);
CREATE INDEX target_students_student_idx ON target_students (student_id);

CREATE TABLE group_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL UNIQUE REFERENCES assignment_targets(id) ON DELETE RESTRICT,
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX group_submissions_submitted_by_idx ON group_submissions (submitted_by);

CREATE TABLE submission_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_student_id UUID NOT NULL UNIQUE REFERENCES target_students(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_created_at_idx ON users (created_at);
