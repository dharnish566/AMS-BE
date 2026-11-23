import { pool } from '../../config/database.js';

const assignmentColumns = 'a.id, a.professor_id, a.title, a.description, a.onedrive_url, a.due_at, a.audience_type, a.status, a.created_at, a.updated_at';

export async function findGroupsByIds(groupIds, client = pool) { const result = await client.query('SELECT id, name FROM groups WHERE id = ANY($1::uuid[])', [groupIds]); return result.rows; }

export async function createAssignment({ professorId, input, groups }) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await client.query(`INSERT INTO assignments (professor_id, title, description, onedrive_url, due_at, audience_type, status) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT') RETURNING ${assignmentColumns}`, [professorId, input.title, input.description, input.onedriveUrl, input.dueAt, input.audienceType]); if (input.audienceType === 'SELECTED_GROUPS') for (const group of groups) await client.query('INSERT INTO assignment_group_selections (assignment_id, group_id) VALUES ($1, $2)', [result.rows[0].id, group.id]); await client.query('COMMIT'); return result.rows[0]; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function listAssignments({ role, userId, query }) {
  const values = [userId]; const conditions = role === 'ADMIN' ? ['a.professor_id = $1'] : [`a.status = 'PUBLISHED'`, `EXISTS (SELECT 1 FROM target_students eligible WHERE eligible.student_id = $1 AND eligible.target_id IN (SELECT id FROM assignment_targets WHERE assignment_id = a.id))`];
  if (query.search) { values.push(`%${query.search}%`); conditions.push(`(a.title ILIKE $${values.length} OR a.description ILIKE $${values.length})`); }
  if (role === 'ADMIN' && query.status) { values.push(query.status); conditions.push(`a.status = $${values.length}`); }
  if (query.due === 'UPCOMING') conditions.push('a.due_at >= NOW()');
  if (query.due === 'OVERDUE') conditions.push('a.due_at < NOW()');
  const statusExpression = role === 'ADMIN' ? 'a.status' : `CASE WHEN EXISTS (SELECT 1 FROM assignment_targets at2 JOIN group_submissions gs ON gs.target_id = at2.id WHERE at2.assignment_id = a.id AND EXISTS (SELECT 1 FROM target_students ts2 WHERE ts2.target_id = at2.id AND ts2.student_id = $1)) OR EXISTS (SELECT 1 FROM target_students ts3 JOIN submission_confirmations sc ON sc.target_student_id = ts3.id JOIN assignment_targets at3 ON at3.id = ts3.target_id WHERE at3.assignment_id = a.id AND ts3.student_id = $1) THEN 'COMPLETED' WHEN a.due_at < NOW() THEN 'OVERDUE' ELSE 'PENDING' END`;
  const result = await pool.query(`SELECT ${assignmentColumns}, ${statusExpression} AS display_status, professor.full_name AS professor_name FROM assignments a JOIN users professor ON professor.id = a.professor_id WHERE ${conditions.join(' AND ')} ORDER BY a.due_at ASC`, values);
  return result.rows;
}

export async function findAssignmentForUser(assignmentId, { role, userId }, client = pool) {
  const access = role === 'ADMIN' ? 'a.professor_id = $2' : `a.status = 'PUBLISHED' AND EXISTS (SELECT 1 FROM target_students ts_access JOIN assignment_targets at_access ON at_access.id = ts_access.target_id WHERE at_access.assignment_id = a.id AND ts_access.student_id = $2)`;
  const result = await client.query(`SELECT ${assignmentColumns}, professor.full_name AS professor_name FROM assignments a JOIN users professor ON professor.id = a.professor_id WHERE a.id = $1 AND ${access}`, [assignmentId, userId]);
  if (!result.rowCount) return null;
  const assignment = result.rows[0];
  const summary = await client.query(`SELECT COUNT(DISTINCT ts.student_id)::int AS recipient_count, COUNT(DISTINCT sc.id)::int AS confirmation_count FROM assignment_targets at JOIN target_students ts ON ts.target_id = at.id LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id WHERE at.assignment_id = $1`, [assignmentId]);
  return { ...assignment, recipientCount: summary.rows[0].recipient_count, confirmationCount: summary.rows[0].confirmation_count };
}

export async function findOwnedAssignment(assignmentId, professorId, client = pool) { const result = await client.query(`SELECT ${assignmentColumns} FROM assignments a WHERE a.id = $1 AND a.professor_id = $2`, [assignmentId, professorId]); return result.rows[0] ?? null; }

export async function updateAssignment(assignmentId, professorId, input) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const current = await findOwnedAssignment(assignmentId, professorId, client); if (!current) { const error = new Error('Assignment not found.'); error.statusCode = 404; error.code = 'ASSIGNMENT_NOT_FOUND'; throw error; } if (current.status !== 'DRAFT' && input.audienceType) { const error = new Error('Assignment audience cannot change after publication.'); error.statusCode = 409; error.code = 'AUDIENCE_IMMUTABLE'; throw error; } const fields = []; const values = []; for (const [column, value] of [['title', input.title], ['description', input.description], ['due_at', input.dueAt], ['onedrive_url', input.onedriveUrl], ['audience_type', input.audienceType]]) if (value !== undefined) { values.push(value); fields.push(`${column} = $${values.length}`); } if (!fields.length) { await client.query('COMMIT'); return current; } values.push(assignmentId, professorId); const result = await client.query(`UPDATE assignments SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND professor_id = $${values.length} RETURNING ${assignmentColumns}`, values); if (current.status === 'DRAFT' && input.groupIds && input.audienceType === 'SELECTED_GROUPS') { await client.query('DELETE FROM assignment_group_selections WHERE assignment_id = $1', [assignmentId]); for (const groupId of input.groupIds) await client.query('INSERT INTO assignment_group_selections (assignment_id, group_id) VALUES ($1, $2)', [assignmentId, groupId]); } await client.query('COMMIT'); return result.rows[0]; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function publishAssignment(assignmentId, professorId) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const assignmentResult = await client.query(`SELECT ${assignmentColumns} FROM assignments a WHERE a.id = $1 AND a.professor_id = $2 FOR UPDATE`, [assignmentId, professorId]); if (!assignmentResult.rowCount) { const error = new Error('Assignment not found.'); error.statusCode = 404; error.code = 'ASSIGNMENT_NOT_FOUND'; throw error; } const assignment = assignmentResult.rows[0]; if (assignment.status !== 'DRAFT') { const error = new Error('Only draft assignments can be published.'); error.statusCode = 409; error.code = 'ALREADY_PUBLISHED'; throw error; }
    if (assignment.audience_type === 'ALL_STUDENTS') { await client.query(`INSERT INTO assignment_targets (assignment_id, target_type, student_id) SELECT $1, 'STUDENT', id FROM users WHERE role = 'STUDENT' ON CONFLICT DO NOTHING`, [assignmentId]); await client.query(`INSERT INTO target_students (target_id, student_id) SELECT at.id, at.student_id FROM assignment_targets at WHERE at.assignment_id = $1 AND at.target_type = 'STUDENT' ON CONFLICT DO NOTHING`, [assignmentId]); }
    else { const selections = await client.query('SELECT group_id FROM assignment_group_selections WHERE assignment_id = $1', [assignmentId]); if (!selections.rowCount) { const error = new Error('Select at least one group before publishing.'); error.statusCode = 400; error.code = 'GROUPS_REQUIRED'; throw error; } for (const selection of selections.rows) await client.query(`INSERT INTO assignment_targets (assignment_id, target_type, group_id) VALUES ($1, 'GROUP', $2) ON CONFLICT DO NOTHING`, [assignmentId, selection.group_id]); await client.query(`INSERT INTO target_students (target_id, student_id) SELECT at.id, gm.student_id FROM assignment_targets at JOIN group_members gm ON gm.group_id = at.group_id AND gm.status = 'ACTIVE' WHERE at.assignment_id = $1 AND at.target_type = 'GROUP' ON CONFLICT DO NOTHING`, [assignmentId]); }
    const published = await client.query(`UPDATE assignments SET status = 'PUBLISHED', updated_at = NOW() WHERE id = $1 RETURNING ${assignmentColumns}`, [assignmentId]); await client.query('COMMIT'); return published.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
