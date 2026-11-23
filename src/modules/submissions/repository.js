import { pool } from '../../config/database.js';

export async function getAssignmentSubmissionStatus(assignmentId, studentId) {
  const result = await pool.query(`
    SELECT a.id AS assignment_id, a.title, a.due_at, a.status AS assignment_status,
      at.id AS target_id, at.target_type, at.group_id, g.name AS group_name,
      ts.id AS target_student_id, sc.confirmed_at,
      gs.submitted_by, gs.submitted_at,
      (g.leader_id = $2) AS can_declare_group_submission
    FROM assignments a
    JOIN assignment_targets at ON at.assignment_id = a.id
    JOIN target_students ts ON ts.target_id = at.id AND ts.student_id = $2
    LEFT JOIN groups g ON g.id = at.group_id
    LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id
    LEFT JOIN group_submissions gs ON gs.target_id = at.id
    WHERE a.id = $1 AND a.status = 'PUBLISHED'
    ORDER BY at.target_type, at.id
  `, [assignmentId, studentId]);
  return result.rows;
}

export async function getAssignmentSubmissionStatusForProfessor(assignmentId, professorId) {
  const result = await pool.query(`
    SELECT a.id AS assignment_id, a.title, a.due_at, a.status AS assignment_status,
      at.id AS target_id, at.target_type, at.group_id, g.name AS group_name,
      ts.id AS target_student_id, ts.student_id, student.full_name AS student_name, student.email AS student_email,
      sc.confirmed_at, gs.submitted_by, gs.submitted_at
    FROM assignments a
    JOIN assignment_targets at ON at.assignment_id = a.id
    JOIN target_students ts ON ts.target_id = at.id
    JOIN users student ON student.id = ts.student_id
    LEFT JOIN groups g ON g.id = at.group_id
    LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id
    LEFT JOIN group_submissions gs ON gs.target_id = at.id
    WHERE a.id = $1 AND a.professor_id = $2
    ORDER BY at.target_type, group_name, student_name
  `, [assignmentId, professorId]);
  return result.rows;
}

export async function confirmTargetStudent({ assignmentId, targetStudentId, studentId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eligible = await client.query(`
      SELECT a.id, a.due_at, a.status, ts.id AS target_student_id
      FROM assignments a
      JOIN assignment_targets at ON at.assignment_id = a.id
      JOIN target_students ts ON ts.target_id = at.id
      WHERE a.id = $1 AND ts.id = $2 AND ts.student_id = $3
      FOR UPDATE OF a, ts
    `, [assignmentId, targetStudentId, studentId]);
    if (!eligible.rowCount || eligible.rows[0].status !== 'PUBLISHED') { const error = new Error('You are not eligible to confirm this assignment.'); error.statusCode = 403; error.code = 'NOT_ELIGIBLE'; throw error; }
    const result = await client.query(`INSERT INTO submission_confirmations (target_student_id) VALUES ($1) RETURNING id, target_student_id, confirmed_at`, [targetStudentId]);
    await client.query('COMMIT');
    return { ...result.rows[0], dueAt: eligible.rows[0].due_at };
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') { error.statusCode = 409; error.code = 'ALREADY_CONFIRMED'; error.message = 'This assignment is already confirmed.'; } throw error; } finally { client.release(); }
}

export async function declareGroupSubmission({ targetId, studentId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eligible = await client.query(`
      SELECT at.id AS target_id, at.target_type, a.id AS assignment_id, a.status, g.leader_id, ts.student_id, a.due_at
      FROM assignment_targets at
      JOIN assignments a ON a.id = at.assignment_id
      JOIN groups g ON g.id = at.group_id
      JOIN target_students ts ON ts.target_id = at.id AND ts.student_id = $2
      WHERE at.id = $1
      FOR UPDATE OF at
    `, [targetId, studentId]);
    if (!eligible.rowCount || eligible.rows[0].target_type !== 'GROUP' || eligible.rows[0].status !== 'PUBLISHED') { const error = new Error('This group submission target is not available.'); error.statusCode = 403; error.code = 'NOT_ELIGIBLE'; throw error; }
    if (eligible.rows[0].leader_id !== studentId) { const error = new Error('Only the group leader can declare a group submission.'); error.statusCode = 403; error.code = 'LEADER_REQUIRED'; throw error; }
    const result = await client.query(`INSERT INTO group_submissions (target_id, submitted_by) VALUES ($1, $2) RETURNING id, target_id, submitted_by, submitted_at`, [targetId, studentId]);
    await client.query('COMMIT');
    return { ...result.rows[0], dueAt: eligible.rows[0].due_at };
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') { error.statusCode = 409; error.code = 'ALREADY_SUBMITTED'; error.message = 'This group submission is already declared.'; } throw error; } finally { client.release(); }
}

export async function getStudentProgress(studentId) {
  const result = await pool.query(`
    WITH eligible AS (
      SELECT DISTINCT a.id, a.title, a.due_at, a.audience_type,
        CASE WHEN EXISTS (SELECT 1 FROM assignment_targets at2 JOIN target_students ts2 ON ts2.target_id = at2.id WHERE at2.assignment_id = a.id AND ts2.student_id = $1 AND at2.target_type = 'GROUP' AND EXISTS (SELECT 1 FROM group_submissions gs2 WHERE gs2.target_id = at2.id)) THEN 'GROUP' ELSE 'INDIVIDUAL' END AS completion_type,
        COALESCE((SELECT sc.confirmed_at FROM assignment_targets at3 JOIN target_students ts3 ON ts3.target_id = at3.id JOIN submission_confirmations sc ON sc.target_student_id = ts3.id WHERE at3.assignment_id = a.id AND ts3.student_id = $1 LIMIT 1), (SELECT gs3.submitted_at FROM assignment_targets at4 JOIN target_students ts4 ON ts4.target_id = at4.id JOIN group_submissions gs3 ON gs3.target_id = at4.id WHERE at4.assignment_id = a.id AND ts4.student_id = $1 LIMIT 1)) AS completed_at,
        EXISTS (SELECT 1 FROM assignment_targets at5 JOIN target_students ts5 ON ts5.target_id = at5.id JOIN submission_confirmations sc5 ON sc5.target_student_id = ts5.id WHERE at5.assignment_id = a.id AND ts5.student_id = $1) AS individually_confirmed,
        EXISTS (SELECT 1 FROM assignment_targets at6 JOIN target_students ts6 ON ts6.target_id = at6.id JOIN group_submissions gs6 ON gs6.target_id = at6.id WHERE at6.assignment_id = a.id AND ts6.student_id = $1) AS group_submitted
      FROM assignments a JOIN assignment_targets at ON at.assignment_id = a.id JOIN target_students ts ON ts.target_id = at.id
      WHERE a.status = 'PUBLISHED' AND ts.student_id = $1
    )
    SELECT *, CASE WHEN completed_at IS NOT NULL AND completed_at > due_at THEN 'COMPLETED_LATE' WHEN completed_at IS NOT NULL THEN 'COMPLETED' WHEN due_at < NOW() THEN 'OVERDUE' ELSE 'PENDING' END AS display_status FROM eligible ORDER BY due_at ASC
  `, [studentId]);
  const rows = result.rows;
  const timestamps = await pool.query(`SELECT DISTINCT a.id, at.target_type, sc.confirmed_at, gs.submitted_at FROM assignments a JOIN assignment_targets at ON at.assignment_id = a.id JOIN target_students ts ON ts.target_id = at.id AND ts.student_id = $1 LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id LEFT JOIN group_submissions gs ON gs.target_id = at.id WHERE a.status = 'PUBLISHED'`, [studentId]);
  const timestampByAssignment = new Map(timestamps.rows.map((row) => [row.id, row]));
  for (const row of rows) { const timestamp = timestampByAssignment.get(row.id); row.completed_at = row.completion_type === 'GROUP' ? timestamp?.submitted_at ?? null : timestamp?.confirmed_at ?? null; row.display_status = row.completed_at ? (new Date(row.completed_at) > new Date(row.due_at) ? 'COMPLETED_LATE' : 'COMPLETED') : (new Date(row.due_at) < new Date() ? 'OVERDUE' : 'PENDING'); }
  const individual = rows.filter((row) => row.completion_type === 'INDIVIDUAL');
  const group = rows.filter((row) => row.completion_type === 'GROUP');
  return { totals: { assigned: rows.length, confirmed: rows.filter((row) => row.display_status === 'COMPLETED' || row.display_status === 'COMPLETED_LATE').length, pending: rows.filter((row) => row.display_status === 'PENDING').length, overdue: rows.filter((row) => row.display_status === 'OVERDUE').length, completionPercent: rows.length ? Math.round((rows.filter((row) => row.display_status === 'COMPLETED' || row.display_status === 'COMPLETED_LATE').length / rows.length) * 100) : 0, individualAssigned: individual.length, individualConfirmed: individual.filter((row) => row.individually_confirmed).length, groupAssigned: group.length, groupSubmitted: group.filter((row) => row.group_submitted).length }, assignments: rows };
}

export async function getGroupProgress(groupId, studentId) {
  const result = await pool.query(`
    SELECT g.id AS group_id, g.name AS group_name, a.id AS assignment_id, a.title, a.due_at,
      gs.submitted_at, COUNT(DISTINCT ts.student_id)::int AS eligible_member_count,
      COUNT(DISTINCT sc.target_student_id)::int AS individual_confirmations,
      CASE WHEN gs.id IS NOT NULL AND gs.submitted_at > a.due_at THEN 'COMPLETED_LATE' WHEN gs.id IS NOT NULL THEN 'COMPLETED' WHEN a.due_at < NOW() THEN 'OVERDUE' ELSE 'PENDING' END AS display_status
    FROM groups g JOIN group_members viewer ON viewer.group_id = g.id AND viewer.student_id = $2 AND viewer.status = 'ACTIVE'
    JOIN assignment_targets at ON at.group_id = g.id AND at.target_type = 'GROUP'
    JOIN assignments a ON a.id = at.assignment_id AND a.status = 'PUBLISHED'
    JOIN target_students ts ON ts.target_id = at.id
    LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id
    LEFT JOIN group_submissions gs ON gs.target_id = at.id
    WHERE g.id = $1
    GROUP BY g.id, g.name, a.id, a.title, a.due_at, gs.id, gs.submitted_at
    ORDER BY a.due_at ASC
  `, [groupId, studentId]);
  return result.rows;
}
