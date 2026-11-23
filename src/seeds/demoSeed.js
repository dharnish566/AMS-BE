import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';

const ids = {
  admins: ['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'],
  students: Array.from({ length: 12 }, (_, index) => `10000000-0000-0000-0000-000000000${String(index + 101).padStart(3, '0')}`),
  groups: Array.from({ length: 4 }, (_, index) => `10000000-0000-0000-0000-000000000${String(index + 201).padStart(3, '0')}`),
  assignments: Array.from({ length: 20 }, (_, index) => `10000000-0000-0000-0000-000000000${String(index + 301).padStart(3, '0')}`),
};

const admins = [
  ['Dr. Meena Kumar', 'meena@joineazy.test'],
  ['Dr. Rajesh Sharma', 'rajesh@joineazy.test'],
];

const students = [
  ['Arun Kumar', 'arun@joineazy.test', 'STU001'], ['Priya S', 'priya@joineazy.test', 'STU002'],
  ['Kavin Raj', 'kavin@joineazy.test', 'STU003'], ['Rahul M', 'rahul@joineazy.test', 'STU004'],
  ['Divya R', 'divya@joineazy.test', 'STU005'], ['Sanjay K', 'sanjay@joineazy.test', 'STU006'],
  ['Nisha P', 'nisha@joineazy.test', 'STU007'], ['Harish S', 'harish@joineazy.test', 'STU008'],
  ['Anjali M', 'anjali@joineazy.test', 'STU009'], ['Vignesh R', 'vignesh@joineazy.test', 'STU010'],
  ['Keerthana S', 'keerthana@joineazy.test', 'STU011'], ['Naveen P', 'naveen@joineazy.test', 'STU012'],
];

const groups = [
  ['Code Titans', 0, [0, 1, 2]],
  ['Tech Innovators', 3, [3, 4, 5]],
  ['Data Wizards', 6, [6, 7, 8]],
  ['Cloud Masters', 9, [9, 10, 11]],
];

const assignments = [
  ['HTML Portfolio Website', 'Build an accessible portfolio site with semantic HTML, responsive sections, and a documented design rationale.', '2026-11-18 23:59:00+05:30', 'ALL_STUDENTS', 'PUBLISHED', 0],
  ['Library Management System', 'Design and implement a small library workflow covering books, members, loans, validation, and reporting.', '2026-11-19 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 1],
  ['React Task Manager', 'Create a React task manager with reusable components, filtering, optimistic UI feedback, and accessible forms.', '2026-11-27 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 0],
  ['JavaScript Fundamentals', 'Demonstrate modern JavaScript fundamentals through modules, asynchronous flows, array transformations, and tests.', '2026-11-29 23:59:00+05:30', 'ALL_STUDENTS', 'PUBLISHED', 1],
  ['PostgreSQL Schema Design', 'Model a normalized academic workflow in PostgreSQL with keys, constraints, indexes, and a short migration plan.', '2026-11-17 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 0],
  ['REST API Development', 'Develop a REST API with resource conventions, validation, pagination, error responses, and integration tests.', '2026-12-02 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 1],
  ['Responsive Landing Page', 'Build a responsive landing page from a content brief and explain the layout decisions across three viewport sizes.', '2026-12-04 23:59:00+05:30', 'ALL_STUDENTS', 'PUBLISHED', 0],
  ['Authentication System', 'Implement secure registration and login flows with password hashing, session handling, and protected routes.', '2026-11-20 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 1],
  ['Docker Deployment', 'Containerize a full-stack service, configure environment variables, and document a repeatable local deployment.', '2026-12-06 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 0],
  ['Git and GitHub Workflow', 'Prepare a draft team workflow covering branching, reviews, commit quality, issue tracking, and release notes.', '2026-12-08 23:59:00+05:30', 'ALL_STUDENTS', 'DRAFT', 1],
  ['Data Visualization', 'Turn a small dataset into a clear dashboard with appropriate chart choices, annotations, and a written interpretation.', '2026-11-16 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 0],
  ['SQL Query Practice', 'Solve progressively harder SQL problems using joins, aggregates, window functions, and query-plan observations.', '2026-11-15 23:59:00+05:30', 'ALL_STUDENTS', 'PUBLISHED', 1],
  ['AWS S3 Integration', 'Design a safe object-storage integration with upload metadata, access boundaries, and failure handling.', '2026-12-10 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 0],
  ['Node.js Middleware', 'Implement composable Node.js middleware for logging, validation, authorization, and consistent error handling.', '2026-12-12 23:59:00+05:30', 'ALL_STUDENTS', 'PUBLISHED', 1],
  ['JWT Authentication', 'Review JWT issuance and verification, token expiry, authorization boundaries, and common implementation mistakes.', '2026-11-19 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 0],
  ['Cloud Architecture Design', 'Prepare a draft cloud architecture proposal with service boundaries, resilience assumptions, and cost considerations.', '2026-12-15 23:59:00+05:30', 'ALL_STUDENTS', 'DRAFT', 1],
  ['API Security Testing', 'Test an API for authorization gaps, input abuse, rate-limit behavior, and safe error disclosure.', '2026-11-14 23:59:00+05:30', 'SELECTED_GROUPS', 'CLOSED', 0],
  ['Python Programming', 'Solve a Python data-processing problem with clear functions, tests, input validation, and complexity notes.', '2026-11-13 23:59:00+05:30', 'ALL_STUDENTS', 'CLOSED', 1],
  ['Full Stack Mini Project', 'Deliver a small full-stack product slice with a documented API, persisted data, validation, and a user walkthrough.', '2026-12-18 23:59:00+05:30', 'SELECTED_GROUPS', 'PUBLISHED', 0],
  ['Final Project Documentation', 'Write concise technical documentation covering setup, architecture, API behavior, testing, and known limitations.', '2026-12-20 23:59:00+05:30', 'ALL_STUDENTS', 'PUBLISHED', 1],
];

const individualCounts = { 1: 3, 2: 6, 3: 0, 4: 12, 5: 0, 6: 2, 7: 5, 8: 2, 9: 5, 11: 0, 12: 12, 13: 3, 14: 0, 15: 3, 17: 2, 18: 8, 19: 9, 20: 2 };
const groupSelectionIndexes = { 2: [0, 1], 3: [2], 5: [3], 6: [0, 2], 8: [1], 9: [0, 1, 3], 11: [1, 2], 13: [3], 15: [0], 17: [1, 3], 19: [0, 1, 2, 3] };
const groupSubmissionIndexes = { 2: [0, 1], 3: [], 5: [], 6: [0], 8: [1], 9: [0, 1], 11: [], 13: [3], 15: [0], 17: [1], 19: [0, 1, 2] };

function requireSeedPassword() {
  if (env.nodeEnv === 'production') throw new Error('Demo seeding is disabled when NODE_ENV=production.');
  if (!env.demoSeedPassword) throw new Error('Set DEMO_SEED_PASSWORD in backend/.env before running db:seed:demo.');
  return env.demoSeedPassword;
}

function demoUrl(index) {
  return env.testOnedriveUrl ?? `https://onedrive.live.com/joineazy-demo/assignment-${String(index).padStart(2, '0')}`;
}

async function ensureUser(client, id, fullName, email, studentId, role, passwordHash) {
  const existing = await client.query('SELECT id, email, student_id, role FROM users WHERE email = $1 OR id = $2', [email, id]);
  if (existing.rowCount && (existing.rows[0].id !== id || existing.rows[0].email.toLowerCase() !== email.toLowerCase())) throw new Error(`Refusing to reuse existing user identity for ${email}.`);
  if (existing.rowCount && (existing.rows[0].role !== role || existing.rows[0].student_id !== studentId)) throw new Error(`Existing demo account ${email} does not match the expected role or student id.`);
  await client.query(`INSERT INTO users (id, full_name, email, student_id, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, student_id = EXCLUDED.student_id, role = EXCLUDED.role, updated_at = NOW()`, [id, fullName, email, studentId, passwordHash, role]);
}

async function seed() {
  const passwordHash = await bcrypt.hash(requireSeedPassword(), 12);
  const client = await pool.connect();
  const targetIds = new Map();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < admins.length; i += 1) await ensureUser(client, ids.admins[i], admins[i][0], admins[i][1], null, 'ADMIN', passwordHash);
    for (let i = 0; i < students.length; i += 1) await ensureUser(client, ids.students[i], students[i][0], students[i][1], students[i][2], 'STUDENT', passwordHash);

    for (let i = 0; i < groups.length; i += 1) {
      const [name, leaderIndex, memberIndexes] = groups[i];
      await client.query(`INSERT INTO groups (id, name, leader_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, leader_id = EXCLUDED.leader_id`, [ids.groups[i], name, ids.students[leaderIndex]]);
      for (const studentIndex of memberIndexes) {
        const conflict = await client.query(`SELECT group_id FROM group_members WHERE student_id = $1 AND status = 'ACTIVE' AND group_id <> $2`, [ids.students[studentIndex], ids.groups[i]]);
        if (conflict.rowCount) throw new Error(`Student ${students[studentIndex][1]} already belongs to another active group.`);
        await client.query(`INSERT INTO group_members (group_id, student_id, status) VALUES ($1, $2, 'ACTIVE') ON CONFLICT DO NOTHING`, [ids.groups[i], ids.students[studentIndex]]);
      }
    }

    const acceptedInvites = [[0, 1], [0, 2], [1, 4], [1, 5], [2, 7], [2, 8], [3, 10], [3, 11]];
    const declinedInvites = [[0, 6], [1, 9], [2, 3], [3, 0]];
    for (let i = 0; i < acceptedInvites.length; i += 1) {
      const [groupIndex, studentIndex] = acceptedInvites[i];
      await client.query(`INSERT INTO group_invitations (id, group_id, invitee_id, invited_by, status, created_at, responded_at) VALUES ($1, $2, $3, $4, 'ACCEPTED', $5, $6) ON CONFLICT (id) DO NOTHING`, [`10000000-0000-0000-0000-000000000${String(401 + i).padStart(3, '0')}`, ids.groups[groupIndex], ids.students[studentIndex], ids.students[groups[groupIndex][1]], '2026-10-02 10:00:00+05:30', '2026-10-03 12:00:00+05:30']);
    }
    for (let i = 0; i < declinedInvites.length; i += 1) {
      const [groupIndex, studentIndex] = declinedInvites[i];
      await client.query(`INSERT INTO group_invitations (id, group_id, invitee_id, invited_by, status, created_at, responded_at) VALUES ($1, $2, $3, $4, 'DECLINED', $5, $6) ON CONFLICT (id) DO NOTHING`, [`10000000-0000-0000-0000-000000000${String(411 + i).padStart(3, '0')}`, ids.groups[groupIndex], ids.students[studentIndex], ids.students[groups[groupIndex][1]], '2026-10-05 10:00:00+05:30', '2026-10-06 12:00:00+05:30']);
    }

    for (let i = 0; i < assignments.length; i += 1) {
      const [title, description, dueAt, audienceType, status, professorIndex] = assignments[i];
      await client.query(`INSERT INTO assignments (id, professor_id, title, description, onedrive_url, due_at, audience_type, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) ON CONFLICT (id) DO UPDATE SET professor_id = EXCLUDED.professor_id, title = EXCLUDED.title, description = EXCLUDED.description, onedrive_url = EXCLUDED.onedrive_url, due_at = EXCLUDED.due_at, audience_type = EXCLUDED.audience_type, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`, [ids.assignments[i], ids.admins[professorIndex], title, description, demoUrl(i + 1), dueAt, audienceType, status, '2026-10-01 09:00:00+05:30']);
      if (status === 'DRAFT') continue;
      if (audienceType === 'ALL_STUDENTS') {
        for (let studentIndex = 0; studentIndex < ids.students.length; studentIndex += 1) {
          const result = await client.query(`INSERT INTO assignment_targets (assignment_id, target_type, student_id, assigned_at) VALUES ($1, 'STUDENT', $2, $3) ON CONFLICT (assignment_id, student_id) WHERE student_id IS NOT NULL DO UPDATE SET assigned_at = EXCLUDED.assigned_at RETURNING id`, [ids.assignments[i], ids.students[studentIndex], '2026-10-01 09:00:00+05:30']);
          targetIds.set(`${i + 1}:S:${studentIndex}`, result.rows[0].id);
          await client.query(`INSERT INTO target_students (target_id, student_id) VALUES ($1, $2) ON CONFLICT (target_id, student_id) DO NOTHING`, [result.rows[0].id, ids.students[studentIndex]]);
        }
      } else {
        for (const groupIndex of groupSelectionIndexes[i + 1]) {
          await client.query(`INSERT INTO assignment_group_selections (assignment_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ids.assignments[i], ids.groups[groupIndex]]);
          const result = await client.query(`INSERT INTO assignment_targets (assignment_id, target_type, group_id, assigned_at) VALUES ($1, 'GROUP', $2, $3) ON CONFLICT (assignment_id, group_id) WHERE group_id IS NOT NULL DO UPDATE SET assigned_at = EXCLUDED.assigned_at RETURNING id`, [ids.assignments[i], ids.groups[groupIndex], '2026-10-01 09:00:00+05:30']);
          targetIds.set(`${i + 1}:G:${groupIndex}`, result.rows[0].id);
          const members = await client.query(`SELECT student_id FROM group_members WHERE group_id = $1 AND status = 'ACTIVE' ORDER BY joined_at, student_id`, [ids.groups[groupIndex]]);
          for (const member of members.rows) await client.query(`INSERT INTO target_students (target_id, student_id) VALUES ($1, $2) ON CONFLICT (target_id, student_id) DO NOTHING`, [result.rows[0].id, member.student_id]);
        }
      }
    }

    for (const [assignmentNumber, count] of Object.entries(individualCounts)) {
      const i = Number(assignmentNumber);
      const eligible = await client.query(`SELECT ts.id FROM assignment_targets at JOIN target_students ts ON ts.target_id = at.id WHERE at.assignment_id = $1 ORDER BY ts.student_id LIMIT $2`, [ids.assignments[i - 1], count]);
      for (let j = 0; j < eligible.rows.length; j += 1) {
        const late = (i === 12 && j >= 6) || (i === 18 && j >= 4);
        const confirmedAt = late ? '2026-11-16 10:00:00+05:30' : (i === 1 ? '2026-11-17 10:00:00+05:30' : '2026-11-10 10:00:00+05:30');
        await client.query(`INSERT INTO submission_confirmations (target_student_id, confirmed_at) VALUES ($1, $2) ON CONFLICT (target_student_id) DO NOTHING`, [eligible.rows[j].id, confirmedAt]);
      }
      if (eligible.rowCount !== count) throw new Error(`Assignment A${String(i).padStart(2, '0')} expected ${count} individual targets but found ${eligible.rowCount}.`);
    }

    for (const [assignmentNumber, groupIndexes] of Object.entries(groupSubmissionIndexes)) {
      const i = Number(assignmentNumber);
      for (const groupIndex of groupIndexes) {
        const targetId = targetIds.get(`${i}:G:${groupIndex}`);
        const submittedAt = i === 8 ? '2026-11-21 12:00:00+05:30' : (i === 17 ? '2026-11-16 12:00:00+05:30' : '2026-11-10 12:00:00+05:30');
        await client.query(`INSERT INTO group_submissions (target_id, submitted_by, submitted_at) VALUES ($1, $2, $3) ON CONFLICT (target_id) DO NOTHING`, [targetId, ids.students[groups[groupIndex][1]], submittedAt]);
      }
    }
    await client.query('COMMIT');
    console.log('Demo seed completed successfully.');
    console.log('Scenario-derived completed target declarations: 86; the requested 54 is inconsistent with the supplied per-assignment counts.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => { console.error(error.message); process.exitCode = 1; });
