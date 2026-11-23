import { pool } from '../../config/database.js';

export async function listGroupsForProfessor(client = pool) { const result = await client.query(`SELECT g.id, g.name, g.leader_id, leader.full_name AS leader_name, COUNT(gm.id)::int AS active_member_count FROM groups g JOIN users leader ON leader.id = g.leader_id LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.status = 'ACTIVE' GROUP BY g.id, leader.full_name ORDER BY g.name ASC`); return result.rows; }

const memberColumns = `gm.id AS membership_id, gm.student_id, u.full_name, u.email, u.student_id AS college_student_id,
  gm.joined_at, (g.leader_id = gm.student_id) AS is_leader`;

export async function createGroupWithLeader({ name, leaderId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT 1 FROM group_members WHERE student_id = $1 AND status = 'ACTIVE' FOR UPDATE`, [leaderId]);
    if (existing.rowCount) return await rollbackWithError(client, 409, 'ALREADY_IN_GROUP', 'You already belong to an active group.');
    const group = await client.query('INSERT INTO groups (name, leader_id) VALUES ($1, $2) RETURNING id, name, leader_id, created_at', [name, leaderId]);
    await client.query(`INSERT INTO group_members (group_id, student_id, status) VALUES ($1, $2, 'ACTIVE')`, [group.rows[0].id, leaderId]);
    await client.query('COMMIT');
    return group.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') error = Object.assign(error, { statusCode: 409, code: 'ALREADY_IN_GROUP', message: 'You already belong to an active group.' });
    throw error;
  } finally { client.release(); }
}

async function rollbackWithError(client, statusCode, code, message) { await client.query('ROLLBACK'); const error = new Error(message); error.statusCode = statusCode; error.code = code; throw error; }

export async function findActiveGroupForStudent(studentId, client = pool) {
  const result = await client.query(`SELECT g.id, g.name, g.leader_id, g.created_at FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.student_id = $1 AND gm.status = 'ACTIVE'`, [studentId]);
  return result.rows[0] ?? null;
}

export async function findGroupDetails(groupId, client = pool) {
  const group = await client.query('SELECT id, name, leader_id, created_at FROM groups WHERE id = $1', [groupId]);
  if (!group.rowCount) return null;
  const members = await client.query(`SELECT ${memberColumns} FROM group_members gm JOIN users u ON u.id = gm.student_id JOIN groups g ON g.id = gm.group_id WHERE gm.group_id = $1 AND gm.status = 'ACTIVE' ORDER BY gm.joined_at ASC`, [groupId]);
  return { ...group.rows[0], members: members.rows, activeMemberCount: members.rowCount };
}

export async function isActiveMember(groupId, studentId, client = pool) { const result = await client.query(`SELECT 1 FROM group_members WHERE group_id = $1 AND student_id = $2 AND status = 'ACTIVE'`, [groupId, studentId]); return result.rowCount > 0; }

export async function findInvitee(identifier, client = pool) {
  const normalized = identifier.trim().toLowerCase();
  const result = await client.query(`SELECT id, full_name, email, student_id FROM users WHERE role = 'STUDENT' AND (email = $1 OR lower(student_id) = $1)`, [normalized]);
  return result.rows[0] ?? null;
}

export async function createInvitation({ groupId, inviteeId, invitedBy }, client = pool) { const result = await client.query(`INSERT INTO group_invitations (group_id, invitee_id, invited_by, status) VALUES ($1, $2, $3, 'PENDING') RETURNING id, group_id, invitee_id, invited_by, status, created_at`, [groupId, inviteeId, invitedBy]); return result.rows[0]; }

export async function findPendingInvitationsForStudent(studentId, client = pool) {
  const result = await client.query(`SELECT gi.id, gi.group_id, gi.status, gi.created_at, g.name AS group_name, inviter.full_name AS inviter_name, inviter.email AS inviter_email FROM group_invitations gi JOIN groups g ON g.id = gi.group_id JOIN users inviter ON inviter.id = gi.invited_by WHERE gi.invitee_id = $1 AND gi.status = 'PENDING' ORDER BY gi.created_at DESC`, [studentId]);
  return result.rows;
}

export async function decideInvitation({ invitationId, studentId, status }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invitationResult = await client.query(`SELECT gi.*, g.name AS group_name FROM group_invitations gi JOIN groups g ON g.id = gi.group_id WHERE gi.id = $1 AND gi.invitee_id = $2 FOR UPDATE`, [invitationId, studentId]);
    if (!invitationResult.rowCount) return await rollbackWithError(client, 404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    const invitation = invitationResult.rows[0];
    if (invitation.status !== 'PENDING') return await rollbackWithError(client, 409, 'INVITATION_ALREADY_RESPONDED', 'This invitation has already been answered.');
    if (status === 'ACCEPTED') {
      const groupResult = await client.query('SELECT id FROM groups WHERE id = $1 FOR UPDATE', [invitation.group_id]);
      if (!groupResult.rowCount) return await rollbackWithError(client, 404, 'GROUP_NOT_FOUND', 'Group not found.');
      const activeMembership = await client.query(`SELECT 1 FROM group_members WHERE student_id = $1 AND status = 'ACTIVE' FOR UPDATE`, [studentId]);
      if (activeMembership.rowCount) return await rollbackWithError(client, 409, 'ALREADY_IN_GROUP', 'You already belong to an active group.');
      const count = await client.query(`SELECT count(*)::int AS count FROM group_members WHERE group_id = $1 AND status = 'ACTIVE'`, [invitation.group_id]);
      if (count.rows[0].count >= 5) return await rollbackWithError(client, 409, 'GROUP_FULL', 'This group has reached its maximum size.');
      await client.query(`INSERT INTO group_members (group_id, student_id, status) VALUES ($1, $2, 'ACTIVE')`, [invitation.group_id, studentId]);
    }
    const updated = await client.query(`UPDATE group_invitations SET status = $1, responded_at = NOW() WHERE id = $2 RETURNING id, group_id, invitee_id, status, responded_at`, [status, invitationId]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function removeMember({ groupId, studentId }) {
  const result = await pool.query(`UPDATE group_members SET status = 'REMOVED' WHERE group_id = $1 AND student_id = $2 AND status = 'ACTIVE' RETURNING id, student_id, status`, [groupId, studentId]);
  return result.rows[0] ?? null;
}
