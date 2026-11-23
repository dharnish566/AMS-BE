import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';

const ids = {
  admin: '00000000-0000-0000-0000-000000000001',
  students: ['00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000106'],
  groups: ['00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202'],
  assignments: ['00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000303'],
};

function requireSeedSecrets() {
  if (!env.demoAdminPassword || !env.demoStudentPassword) {
    throw new Error('Set DEMO_ADMIN_PASSWORD and DEMO_STUDENT_PASSWORD before running npm run db:seed.');
  }
}

async function seed() {
  requireSeedSecrets();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const adminHash = await bcrypt.hash(env.demoAdminPassword, 12);
    const studentHash = await bcrypt.hash(env.demoStudentPassword, 12);
    await client.query(`INSERT INTO users (id, full_name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'ADMIN') ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`, [ids.admin, 'Dr. Maya Patel', 'maya.patel@joineazy.demo', adminHash]);
    const students = [
      ['Aarav Mehta', 'aarav.mehta@joineazy.demo', 'STU-1001'], ['Isha Nair', 'isha.nair@joineazy.demo', 'STU-1002'],
      ['Kabir Shah', 'kabir.shah@joineazy.demo', 'STU-1003'], ['Ananya Rao', 'ananya.rao@joineazy.demo', 'STU-1004'],
      ['Rohan Iyer', 'rohan.iyer@joineazy.demo', 'STU-1005'], ['Meera Singh', 'meera.singh@joineazy.demo', 'STU-1006'],
    ];
    for (let i = 0; i < students.length; i += 1) {
      await client.query(`INSERT INTO users (id, full_name, email, student_id, password_hash, role) VALUES ($1, $2, $3, $4, $5, 'STUDENT') ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`, [ids.students[i], ...students[i], studentHash]);
    }
    await client.query(`INSERT INTO groups (id, name, leader_id) VALUES ($1, 'Atlas Research Team', $2), ($3, 'Northstar Design Group', $4) ON CONFLICT (id) DO NOTHING`, [ids.groups[0], ids.students[0], ids.groups[1], ids.students[3]]);
    const memberships = [[ids.groups[0], ids.students[0]], [ids.groups[0], ids.students[1]], [ids.groups[0], ids.students[2]], [ids.groups[1], ids.students[3]], [ids.groups[1], ids.students[4]], [ids.groups[1], ids.students[5]]];
    for (const [groupId, studentId] of memberships) await client.query(`INSERT INTO group_members (group_id, student_id, status) VALUES ($1, $2, 'ACTIVE') ON CONFLICT DO NOTHING`, [groupId, studentId]);
    await client.query(`INSERT INTO group_invitations (group_id, invitee_id, invited_by, status, responded_at) SELECT $1, $2, $3, 'ACCEPTED', NOW() WHERE NOT EXISTS (SELECT 1 FROM group_invitations WHERE group_id = $1 AND invitee_id = $2 AND status = 'ACCEPTED')`, [ids.groups[0], ids.students[1], ids.students[0]]);

    const assignmentRows = [
      [ids.assignments[0], 'Distributed Systems Case Study', 'Compare two distributed coordination strategies using a real-world system.', 'https://onedrive.live.com/joineazy-demo/distributed-systems', '2027-02-15T17:00:00Z', 'ALL_STUDENTS', 'PUBLISHED'],
      [ids.assignments[1], 'Campus Mobility Prototype', 'Submit the group research brief and prototype walkthrough.', 'https://onedrive.live.com/joineazy-demo/campus-mobility', '2027-03-01T17:00:00Z', 'SELECTED_GROUPS', 'PUBLISHED'],
      [ids.assignments[2], 'Research Methods Reflection', 'Reflect on sampling, bias, and reproducibility in applied research.', 'https://onedrive.live.com/joineazy-demo/research-methods', '2026-10-15T17:00:00Z', 'ALL_STUDENTS', 'CLOSED'],
    ];
    for (const row of assignmentRows) await client.query(`INSERT INTO assignments (id, professor_id, title, description, onedrive_url, due_at, audience_type, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`, [row[0], ids.admin, ...row.slice(1)]);
    const targets = [];
    for (const studentId of ids.students) {
      const targetId = `00000000-0000-0000-0000-0000000004${String(targets.length + 1).padStart(3, '0')}`;
      targets.push([targetId, ids.assignments[0], 'STUDENT', null, studentId]);
    }
    targets.push(['00000000-0000-0000-0000-000000000407', ids.assignments[1], 'GROUP', ids.groups[0], null], ['00000000-0000-0000-0000-000000000408', ids.assignments[1], 'GROUP', ids.groups[1], null]);
    for (const [targetId, assignmentId, type, groupId, studentId] of targets) await client.query(`INSERT INTO assignment_targets (id, assignment_id, target_type, group_id, student_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`, [targetId, assignmentId, type, groupId, studentId]);
    for (const [targetId, , type, groupId, studentId] of targets) {
      if (type === 'STUDENT') await client.query(`INSERT INTO target_students (target_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [targetId, studentId]);
      else {
        const members = await client.query('SELECT student_id FROM group_members WHERE group_id = $1 AND status = $2', [groupId, 'ACTIVE']);
        for (const member of members.rows) await client.query(`INSERT INTO target_students (target_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [targetId, member.student_id]);
      }
    }
    await client.query(`INSERT INTO group_submissions (target_id, submitted_by, submitted_at) VALUES ($1, $2, '2027-02-20T12:00:00Z'), ($3, $4, '2027-02-20T12:30:00Z') ON CONFLICT (target_id) DO NOTHING`, [targets[6][0], ids.students[0], targets[7][0], ids.students[3]]);
    await client.query(`INSERT INTO submission_confirmations (target_student_id, confirmed_at) SELECT ts.id, '2027-02-10T12:00:00Z' FROM target_students ts WHERE ts.target_id = $1 AND ts.student_id IN ($2, $3) ON CONFLICT DO NOTHING`, [targets[0][0], ids.students[0], ids.students[1]]);
    await client.query('COMMIT');
    console.log('Seed data inserted or already present.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });
