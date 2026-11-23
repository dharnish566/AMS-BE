import assert from 'node:assert/strict';
import { pool } from '../config/database.js';

async function expectRejected(client, sql, values) {
  await assert.rejects(client.query(sql, values));
}

async function verify() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1 FROM users LIMIT 1');
    const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users','groups','group_members','group_invitations','assignments','assignment_targets','target_students','group_submissions','submission_confirmations')`);
    assert.equal(tables.rowCount, 9);
    await expectRejected(client, `INSERT INTO group_members (group_id, student_id, status) VALUES ('00000000-0000-0000-0000-000000009999', '00000000-0000-0000-0000-000000000101', 'ACTIVE')`);
    const duplicate = await client.query(`SELECT group_id, student_id FROM group_members WHERE status = 'ACTIVE' LIMIT 1`);
    if (duplicate.rowCount) await expectRejected(client, `INSERT INTO group_members (group_id, student_id, status) VALUES ($1, $2, 'ACTIVE')`, [duplicate.rows[0].group_id, duplicate.rows[0].student_id]);
    const counts = await client.query(`SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM assignments) AS assignments, (SELECT count(*) FROM target_students) AS target_students`);
    assert.ok(Number(counts.rows[0].users) >= 7);
    assert.ok(Number(counts.rows[0].assignments) >= 3);
    assert.ok(Number(counts.rows[0].target_students) >= 10);
    console.log('Database verification passed: connection, schema, foreign keys, uniqueness, and query checks.');
  } finally {
    client.release();
    await pool.end();
  }
}

verify().catch((error) => { console.error(error); process.exitCode = 1; });
