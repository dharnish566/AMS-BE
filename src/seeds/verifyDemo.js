import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import { getAdminAnalytics } from '../modules/analytics/repository.js';

const studentEmails = ['arun@joineazy.test', 'priya@joineazy.test', 'kavin@joineazy.test', 'rahul@joineazy.test', 'divya@joineazy.test', 'sanjay@joineazy.test', 'nisha@joineazy.test', 'harish@joineazy.test', 'anjali@joineazy.test', 'vignesh@joineazy.test', 'keerthana@joineazy.test', 'naveen@joineazy.test'];
const adminEmails = ['meena@joineazy.test', 'rajesh@joineazy.test'];
const assignmentTitles = ['HTML Portfolio Website', 'Library Management System', 'React Task Manager', 'JavaScript Fundamentals', 'PostgreSQL Schema Design', 'REST API Development', 'Responsive Landing Page', 'Authentication System', 'Docker Deployment', 'Git and GitHub Workflow', 'Data Visualization', 'SQL Query Practice', 'AWS S3 Integration', 'Node.js Middleware', 'JWT Authentication', 'Cloud Architecture Design', 'API Security Testing', 'Python Programming', 'Full Stack Mini Project', 'Final Project Documentation'];
const expectedStatuses = { PUBLISHED: 16, DRAFT: 2, CLOSED: 2 };
const expectedIndividual = { 1: 3, 2: 6, 3: 0, 4: 12, 5: 0, 6: 2, 7: 5, 8: 2, 9: 5, 11: 0, 12: 12, 13: 3, 14: 0, 15: 3, 17: 2, 18: 8, 19: 9, 20: 2 };
const expectedGroupSubmissions = { 2: 2, 3: 0, 5: 0, 6: 1, 8: 1, 9: 2, 11: 0, 13: 1, 15: 1, 17: 1, 19: 3 };

async function apiJson(path, options = {}) {
  const response = await fetch(`http://localhost:${env.port}${path}`, options);
  const body = await response.json();
  assert.equal(response.ok, true, `${options.method ?? 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function login(email) {
  assert.ok(env.demoSeedPassword, 'DEMO_SEED_PASSWORD must be configured for API verification.');
  const body = await apiJson('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: env.demoSeedPassword }) });
  return body.accessToken;
}

async function verifyApi() {
  const studentToken = await login(studentEmails[0]);
  const adminToken = await login(adminEmails[0]);
  const secondAdminToken = await login(adminEmails[1]);
  const studentHeaders = { authorization: `Bearer ${studentToken}` };
  const adminHeaders = { authorization: `Bearer ${adminToken}` };
  const secondAdminHeaders = { authorization: `Bearer ${secondAdminToken}` };
  const [studentAssignments, progress, groupResponse, adminAssignments, secondAdminAssignments, analytics, secondAnalytics] = await Promise.all([
    apiJson('/api/assignments', { headers: studentHeaders }),
    apiJson('/api/student/progress', { headers: studentHeaders }),
    apiJson('/api/groups/me', { headers: studentHeaders }),
    apiJson('/api/assignments', { headers: adminHeaders }),
    apiJson('/api/assignments', { headers: secondAdminHeaders }),
    apiJson('/api/admin/analytics', { headers: adminHeaders }),
    apiJson('/api/admin/analytics', { headers: secondAdminHeaders }),
  ]);
  assert.ok(studentAssignments.assignments.length > 0);
  assert.equal(studentAssignments.assignments.some((assignment) => assignment.status === 'DRAFT'), false);
  assert.equal(groupResponse.group.name, 'Code Titans');
  assert.equal(groupResponse.group.members.length, 3);
  assert.ok(progress.totals.assigned > 0);
  assert.equal(adminAssignments.assignments.filter((assignment) => assignmentTitles.includes(assignment.title)).length, 10);
  assert.equal(secondAdminAssignments.assignments.filter((assignment) => assignmentTitles.includes(assignment.title)).length, 10);
  assert.equal(analytics.assignmentRates.filter((assignment) => assignmentTitles.includes(assignment.title)).length, 9);
  assert.equal(secondAnalytics.assignmentRates.filter((assignment) => assignmentTitles.includes(assignment.title)).length, 7);
  assert.ok(Number(analytics.confirmedPending.confirmed) > 0);
  console.log('API portal smoke checks passed for one student and one professor account.');
}

async function verify() {
  if (env.nodeEnv === 'production') throw new Error('Demo verification is disabled when NODE_ENV=production.');
  const client = await pool.connect();
  try {
    const accounts = await client.query(`SELECT role, COUNT(*)::int AS count FROM users WHERE email = ANY($1::citext[]) GROUP BY role`, [[...adminEmails, ...studentEmails]]);
    assert.deepEqual(Object.fromEntries(accounts.rows.map((row) => [row.role, row.count])), { ADMIN: 2, STUDENT: 12 });

    const groupResult = await client.query(`SELECT g.name, COUNT(gm.id)::int AS members FROM groups g JOIN group_members gm ON gm.group_id = g.id AND gm.status = 'ACTIVE' WHERE g.name = ANY($1::text[]) GROUP BY g.id, g.name ORDER BY g.name`, [['Code Titans', 'Tech Innovators', 'Data Wizards', 'Cloud Masters']]);
    assert.equal(groupResult.rowCount, 4);
    assert.ok(groupResult.rows.every((row) => row.members === 3));
    const duplicateMemberships = await client.query(`SELECT student_id FROM group_members WHERE status = 'ACTIVE' GROUP BY student_id HAVING COUNT(*) > 1`);
    assert.equal(duplicateMemberships.rowCount, 0);

    const assignmentResult = await client.query(`SELECT id, title, status, audience_type FROM assignments WHERE title = ANY($1::text[]) ORDER BY title`, [assignmentTitles]);
    assert.equal(assignmentResult.rowCount, 20);
    const statusCounts = Object.fromEntries((await client.query(`SELECT status, COUNT(*)::int AS count FROM assignments WHERE title = ANY($1::text[]) GROUP BY status`, [assignmentTitles])).rows.map((row) => [row.status, row.count]));
    assert.deepEqual(statusCounts, expectedStatuses);

    const totals = await client.query(`SELECT COUNT(DISTINCT at.id) FILTER (WHERE a.status <> 'DRAFT')::int AS targets, COUNT(DISTINCT ts.id)::int AS target_students, COUNT(DISTINCT sc.id)::int AS individual_confirmations, COUNT(DISTINCT gs.id)::int AS group_submissions FROM assignments a LEFT JOIN assignment_targets at ON at.assignment_id = a.id LEFT JOIN target_students ts ON ts.target_id = at.id LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id LEFT JOIN group_submissions gs ON gs.target_id = at.id WHERE a.title = ANY($1::text[])`, [assignmentTitles]);
    assert.equal(totals.rows[0].targets, 104);
    assert.equal(totals.rows[0].target_students, 144);
    assert.equal(totals.rows[0].individual_confirmations, 74);
    assert.equal(totals.rows[0].group_submissions, 12);

    const invalidForeignKeys = await client.query(`SELECT COUNT(*)::int AS count FROM assignment_targets at LEFT JOIN assignments a ON a.id = at.assignment_id WHERE a.id IS NULL UNION ALL SELECT COUNT(*)::int FROM target_students ts LEFT JOIN assignment_targets at ON at.id = ts.target_id WHERE at.id IS NULL UNION ALL SELECT COUNT(*)::int FROM submission_confirmations sc LEFT JOIN target_students ts ON ts.id = sc.target_student_id WHERE ts.id IS NULL`);
    assert.ok(invalidForeignKeys.rows.every((row) => row.count === 0));
    const duplicateConfirmations = await client.query(`SELECT target_student_id FROM submission_confirmations GROUP BY target_student_id HAVING COUNT(*) > 1`);
    assert.equal(duplicateConfirmations.rowCount, 0);

    const summaries = await client.query(`SELECT a.title, a.status, COUNT(DISTINCT at.id)::int AS targets, COUNT(DISTINCT ts.id)::int AS eligible, COUNT(DISTINCT sc.id)::int AS confirmations, COUNT(DISTINCT gs.id)::int AS group_submissions FROM assignments a LEFT JOIN assignment_targets at ON at.assignment_id = a.id LEFT JOIN target_students ts ON ts.target_id = at.id LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id LEFT JOIN group_submissions gs ON gs.target_id = at.id WHERE a.title = ANY($1::text[]) GROUP BY a.id, a.title, a.status ORDER BY a.title`, [assignmentTitles]);
    console.table(summaries.rows);

    const adminRows = await client.query(`SELECT id, email FROM users WHERE email = ANY($1::citext[]) ORDER BY email`, [adminEmails]);
    for (const admin of adminRows.rows) {
      const analytics = await getAdminAnalytics(admin.id);
      const direct = await client.query(`WITH targets AS (SELECT DISTINCT at.id, CASE WHEN at.target_type = 'GROUP' THEN EXISTS (SELECT 1 FROM group_submissions gs WHERE gs.target_id = at.id) ELSE EXISTS (SELECT 1 FROM target_students ts JOIN submission_confirmations sc ON sc.target_student_id = ts.id WHERE ts.target_id = at.id) END AS completed FROM assignments a JOIN assignment_targets at ON at.assignment_id = a.id WHERE a.professor_id = $1 AND a.status = 'PUBLISHED') SELECT COUNT(*) FILTER (WHERE completed)::int AS confirmed, COUNT(*) FILTER (WHERE NOT completed)::int AS pending FROM targets`, [admin.id]);
      assert.equal(Number(analytics.confirmedPending.confirmed), direct.rows[0].confirmed);
      assert.equal(Number(analytics.confirmedPending.pending), direct.rows[0].pending);
    }
    console.log('Direct SQL and backend analytics results match for both professors.');
  } finally {
    client.release();
    await pool.end();
  }
  if (process.env.RUN_DEMO_API_VERIFY !== 'false') await verifyApi();
  console.log('Demo database verification passed.');
}

verify().catch((error) => { console.error(error.message); process.exitCode = 1; });
