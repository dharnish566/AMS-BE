import { pool } from '../../config/database.js';

export async function getAssignmentSubmissionStatus(assignmentId, studentId) {
  const result = await pool.query(`
    SELECT a.id AS assignment_id, a.title, a.due_at, a.status AS assignment_status, a.submission_provider,
      at.id AS target_id, at.target_type, at.group_id, g.name AS group_name, g.leader_id,
      ts.id AS target_student_id, sc.confirmed_at,
      sv.id AS verification_id, sv.status AS verification_status, sv.filename AS verified_filename,
      sv.file_size AS verified_file_size, sv.verified_at, sv.review_reason,
      sv.is_late, sr.request_url, sr.destination_path,
      gs.submitted_by, gs.submitted_at,
      (g.leader_id = $2) AS can_declare_group_submission,
      (g.leader_id = $2 OR at.target_type = 'STUDENT') AS is_submission_authority
    FROM assignments a
    JOIN assignment_targets at ON at.assignment_id = a.id
    JOIN target_students ts ON ts.target_id = at.id AND ts.student_id = $2
    LEFT JOIN groups g ON g.id = at.group_id
    LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id
    LEFT JOIN group_submissions gs ON gs.target_id = at.id
    LEFT JOIN submission_verifications sv ON sv.assignment_id = a.id AND (
      (at.target_type = 'STUDENT' AND sv.target_student_id = ts.id)
      OR (at.target_type = 'GROUP' AND sv.target_id = at.id AND sv.target_student_id IS NULL)
    )
    LEFT JOIN assignment_submission_requests sr ON sr.assignment_id = a.id
      AND sr.recipient_type = CASE WHEN at.target_type = 'GROUP' THEN 'GROUP' ELSE 'STUDENT' END
      AND sr.recipient_id = CASE WHEN at.target_type = 'GROUP' THEN at.group_id ELSE ts.student_id END
    WHERE a.id = $1 AND a.status = 'PUBLISHED'
    ORDER BY at.target_type, at.id
  `, [assignmentId, studentId]);
  return result.rows;
}

export async function getAssignmentSubmissionStatusForProfessor(assignmentId, professorId) {
  const result = await pool.query(`
    SELECT a.id AS assignment_id, a.title, a.due_at, a.status AS assignment_status, a.submission_provider,
      at.id AS target_id, at.target_type, at.group_id, g.name AS group_name,
      g.leader_id, leader.full_name AS leader_name, leader.student_id AS leader_student_id,
      ts.id AS target_student_id, ts.student_id, student.full_name AS student_name, student.email AS student_email,
      student.student_id AS student_number,
      sc.confirmed_at, gs.submitted_by, gs.submitted_at,
      sv.id AS verification_id, sv.status AS verification_status, sv.filename AS verified_filename,
      sv.file_size AS verified_file_size, sv.verified_at, sv.is_late, sv.review_reason,
      sr.request_url, sr.destination_path,
      COUNT(DISTINCT ts.id) OVER (PARTITION BY at.id)::int AS eligible_members_count,
      COUNT(DISTINCT sc.id) OVER (PARTITION BY at.id)::int AS individual_confirmations_count
    FROM assignments a
    JOIN assignment_targets at ON at.assignment_id = a.id
    JOIN target_students ts ON ts.target_id = at.id
    JOIN users student ON student.id = ts.student_id
    LEFT JOIN groups g ON g.id = at.group_id
    LEFT JOIN users leader ON leader.id = g.leader_id
    LEFT JOIN submission_confirmations sc ON sc.target_student_id = ts.id
    LEFT JOIN group_submissions gs ON gs.target_id = at.id
    LEFT JOIN submission_verifications sv ON sv.assignment_id = a.id AND (
      (at.target_type = 'STUDENT' AND sv.target_student_id = ts.id)
      OR (at.target_type = 'GROUP' AND sv.target_id = at.id AND sv.target_student_id IS NULL)
    )
    LEFT JOIN assignment_submission_requests sr ON sr.assignment_id = a.id
      AND sr.recipient_type = CASE WHEN at.target_type = 'GROUP' THEN 'GROUP' ELSE 'STUDENT' END
      AND sr.recipient_id = CASE WHEN at.target_type = 'GROUP' THEN at.group_id ELSE ts.student_id END
    WHERE a.id = $1 AND a.professor_id = $2
    ORDER BY at.target_type, group_name, student_name
  `, [assignmentId, professorId]);
  return result.rows;
}

export async function assignmentOwnedByProfessor(assignmentId, professorId) {
  const result = await pool.query('SELECT 1 FROM assignments WHERE id = $1 AND professor_id = $2', [assignmentId, professorId]);
  return result.rowCount > 0;
}

export async function confirmTargetStudent({ assignmentId, targetStudentId, studentId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eligible = await client.query(`
      SELECT a.id, a.due_at, a.status, a.submission_provider, ts.id AS target_student_id, at.id AS target_id, at.target_type
      FROM assignments a
      JOIN assignment_targets at ON at.assignment_id = a.id
      JOIN target_students ts ON ts.target_id = at.id
      WHERE a.id = $1 AND ts.id = $2 AND ts.student_id = $3
      FOR UPDATE OF a, ts
    `, [assignmentId, targetStudentId, studentId]);

    if (!eligible.rowCount || eligible.rows[0].status !== 'PUBLISHED') {
      const error = new Error('You are not eligible to confirm this assignment.');
      error.statusCode = 403;
      error.code = 'NOT_ELIGIBLE';
      throw error;
    }

    const row = eligible.rows[0];

    // Check verification record: for STUDENT target, check target_student_id; for GROUP target, check target_id
    const verification = row.submission_provider === 'DROPBOX'
      ? await client.query(
          `SELECT id, status FROM submission_verifications
           WHERE assignment_id = $1 AND (
             (target_student_id = $2 AND $2::uuid IS NOT NULL)
             OR (target_id = $3 AND target_student_id IS NULL)
           )
           FOR UPDATE`,
          [assignmentId, row.target_student_id, row.target_id]
        )
      : { rowCount: 0, rows: [] };

    const result = await client.query(
      `INSERT INTO submission_confirmations (target_student_id) VALUES ($1)
       RETURNING id, target_student_id, confirmed_at`,
      [targetStudentId]
    );

    if (verification.rowCount) {
      await client.query(
        `UPDATE submission_verifications
         SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [verification.rows[0].id]
      );
      await client.query(
        `INSERT INTO submission_verification_events (verification_id, assignment_id, actor_id, event_type, status)
         VALUES ($1, $2, $3, 'STUDENT_CONFIRMED', 'CONFIRMED')`,
        [verification.rows[0].id, assignmentId, studentId]
      );
    }

    await client.query('COMMIT');
    return { ...result.rows[0], dueAt: row.due_at };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      error.statusCode = 409;
      error.code = 'ALREADY_CONFIRMED';
      error.message = 'This assignment is already confirmed.';
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function declareGroupSubmission({ targetId, studentId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const eligible = await client.query(`
      SELECT at.id AS target_id, at.target_type, a.id AS assignment_id, a.status, a.submission_provider, g.leader_id, ts.student_id, a.due_at
      FROM assignment_targets at
      JOIN assignments a ON a.id = at.assignment_id
      JOIN groups g ON g.id = at.group_id
      JOIN target_students ts ON ts.target_id = at.id AND ts.student_id = $2
      WHERE at.id = $1
      FOR UPDATE OF at
    `, [targetId, studentId]);

    if (!eligible.rowCount || eligible.rows[0].target_type !== 'GROUP' || eligible.rows[0].status !== 'PUBLISHED') {
      const error = new Error('This group submission target is not available.');
      error.statusCode = 403;
      error.code = 'NOT_ELIGIBLE';
      throw error;
    }
    if (eligible.rows[0].leader_id !== studentId) {
      const error = new Error('Only the group leader can declare a group submission.');
      error.statusCode = 403;
      error.code = 'LEADER_REQUIRED';
      throw error;
    }

    const verification = eligible.rows[0].submission_provider === 'DROPBOX'
      ? await client.query(
          `SELECT id, status FROM submission_verifications
           WHERE assignment_id = $1 AND target_id = $2 AND target_student_id IS NULL
           FOR UPDATE`,
          [eligible.rows[0].assignment_id, targetId]
        )
      : { rowCount: 0, rows: [] };

    const result = await client.query(
      `INSERT INTO group_submissions (target_id, submitted_by) VALUES ($1, $2)
       RETURNING id, target_id, submitted_by, submitted_at`,
      [targetId, studentId]
    );

    if (verification.rowCount) {
      await client.query(
        `UPDATE submission_verifications
         SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [verification.rows[0].id]
      );
      await client.query(
        `INSERT INTO submission_verification_events (verification_id, assignment_id, actor_id, event_type, status)
         VALUES ($1, $2, $3, 'GROUP_CONFIRMED', 'CONFIRMED')`,
        [verification.rows[0].id, eligible.rows[0].assignment_id, studentId]
      );
    }

    await client.query('COMMIT');
    return { ...result.rows[0], dueAt: eligible.rows[0].due_at };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      error.statusCode = 409;
      error.code = 'ALREADY_SUBMITTED';
      error.message = 'This group submission is already declared.';
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmSubmissionUnified({ assignmentId, studentId, targetStudentId, targetId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find recipient target for this student and assignment
    const targetQuery = await client.query(`
      SELECT a.id AS assignment_id, a.due_at, a.status, a.submission_provider,
             at.id AS target_id, at.target_type, at.group_id, g.leader_id,
             ts.id AS target_student_id
      FROM assignments a
      JOIN assignment_targets at ON at.assignment_id = a.id
      JOIN target_students ts ON ts.target_id = at.id AND ts.student_id = $2
      LEFT JOIN groups g ON g.id = at.group_id
      WHERE a.id = $1 AND a.status = 'PUBLISHED'
        AND ($3::uuid IS NULL OR ts.id = $3)
        AND ($4::uuid IS NULL OR at.id = $4)
      FOR UPDATE OF a, at
      LIMIT 1
    `, [assignmentId, studentId, targetStudentId ?? null, targetId ?? null]);

    if (!targetQuery.rowCount) {
      const error = new Error('You are not eligible to confirm this assignment.');
      error.statusCode = 403;
      error.code = 'NOT_ELIGIBLE';
      throw error;
    }

    const item = targetQuery.rows[0];

    if (item.target_type === 'GROUP') {
      // Group assignment: only designated group leader can finalize
      if (item.leader_id !== studentId) {
        const error = new Error('Only the designated group leader can finalize the group submission.');
        error.statusCode = 403;
        error.code = 'LEADER_REQUIRED';
        throw error;
      }

      // Check if already submitted
      const existingSub = await client.query(
        'SELECT id, submitted_at FROM group_submissions WHERE target_id = $1',
        [item.target_id]
      );
      if (existingSub.rowCount) {
        const error = new Error('This group submission has already been confirmed.');
        error.statusCode = 409;
        error.code = 'ALREADY_CONFIRMED';
        throw error;
      }

      // Check server-side verification evidence
      if (item.submission_provider === 'DROPBOX') {
        const verification = await client.query(
          `SELECT id, status, filename, file_size, verified_at
           FROM submission_verifications
           WHERE assignment_id = $1 AND target_id = $2 AND target_student_id IS NULL
           FOR UPDATE`,
          [assignmentId, item.target_id]
        );
        if (verification.rowCount) {
          await client.query(
            `UPDATE submission_verifications
             SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [verification.rows[0].id]
          );

          await client.query(
            `INSERT INTO submission_verification_events (verification_id, assignment_id, actor_id, event_type, status)
             VALUES ($1, $2, $3, 'GROUP_CONFIRMED', 'CONFIRMED')`,
            [verification.rows[0].id, assignmentId, studentId]
          );
        }
      }

      const subResult = await client.query(
        `INSERT INTO group_submissions (target_id, submitted_by)
         VALUES ($1, $2)
         RETURNING id, target_id, submitted_by, submitted_at`,
        [item.target_id, studentId]
      );

      await client.query('COMMIT');
      return {
        confirmed: true,
        type: 'GROUP',
        targetId: item.target_id,
        submittedAt: subResult.rows[0].submitted_at,
        dueAt: item.due_at,
      };
    } else {
      // Individual assignment:
      const existingConf = await client.query(
        'SELECT id, confirmed_at FROM submission_confirmations WHERE target_student_id = $1',
        [item.target_student_id]
      );
      if (existingConf.rowCount) {
        const error = new Error('This submission has already been confirmed.');
        error.statusCode = 409;
        error.code = 'ALREADY_CONFIRMED';
        throw error;
      }

      // Check server-side verification evidence
      if (item.submission_provider === 'DROPBOX') {
        const verification = await client.query(
          `SELECT id, status, filename, file_size, verified_at
           FROM submission_verifications
           WHERE assignment_id = $1 AND target_student_id = $2
           FOR UPDATE`,
          [assignmentId, item.target_student_id]
        );
        if (verification.rowCount) {
          await client.query(
            `UPDATE submission_verifications
             SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [verification.rows[0].id]
          );

          await client.query(
            `INSERT INTO submission_verification_events (verification_id, assignment_id, actor_id, event_type, status)
             VALUES ($1, $2, $3, 'STUDENT_CONFIRMED', 'CONFIRMED')`,
            [verification.rows[0].id, assignmentId, studentId]
          );
        }
      }

      const confResult = await client.query(
        `INSERT INTO submission_confirmations (target_student_id)
         VALUES ($1)
         RETURNING id, target_student_id, confirmed_at`,
        [item.target_student_id]
      );

      await client.query('COMMIT');
      return {
        confirmed: true,
        type: 'STUDENT',
        targetStudentId: item.target_student_id,
        confirmedAt: confResult.rows[0].confirmed_at,
        dueAt: item.due_at,
      };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getStudentProgress(studentId) {
  const result = await pool.query(`
    WITH eligible AS (
      SELECT DISTINCT a.id, a.title, a.due_at, a.audience_type, professor.full_name AS professor_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM assignment_targets at2
          JOIN target_students ts2 ON ts2.target_id = at2.id
          WHERE at2.assignment_id = a.id AND ts2.student_id = $1 AND at2.target_type = 'GROUP'
        ) THEN 'GROUP' ELSE 'INDIVIDUAL' END AS completion_type,
        COALESCE(
          (SELECT sc.confirmed_at FROM assignment_targets at3
           JOIN target_students ts3 ON ts3.target_id = at3.id
           JOIN submission_confirmations sc ON sc.target_student_id = ts3.id
           WHERE at3.assignment_id = a.id AND ts3.student_id = $1 LIMIT 1),
          (SELECT gs3.submitted_at FROM assignment_targets at4
           JOIN target_students ts4 ON ts4.target_id = at4.id
           JOIN group_submissions gs3 ON gs3.target_id = at4.id
           WHERE at4.assignment_id = a.id AND ts4.student_id = $1 LIMIT 1)
        ) AS completed_at,
        EXISTS (
          SELECT 1 FROM assignment_targets at5
          JOIN target_students ts5 ON ts5.target_id = at5.id
          JOIN submission_confirmations sc5 ON sc5.target_student_id = ts5.id
          WHERE at5.assignment_id = a.id AND ts5.student_id = $1
        ) AS individually_confirmed,
        EXISTS (
          SELECT 1 FROM assignment_targets at6
          JOIN target_students ts6 ON ts6.target_id = at6.id
          JOIN group_submissions gs6 ON gs6.target_id = at6.id
          WHERE at6.assignment_id = a.id AND ts6.student_id = $1
        ) AS group_submitted
      FROM assignments a
      JOIN users professor ON professor.id = a.professor_id
      JOIN assignment_targets at ON at.assignment_id = a.id
      JOIN target_students ts ON ts.target_id = at.id
      WHERE a.status = 'PUBLISHED' AND ts.student_id = $1
    )
    SELECT *,
      CASE
        WHEN completed_at IS NOT NULL AND completed_at > due_at THEN 'COMPLETED_LATE'
        WHEN completed_at IS NOT NULL THEN 'COMPLETED'
        WHEN due_at < NOW() THEN 'OVERDUE'
        ELSE 'PENDING'
      END AS display_status
    FROM eligible
    ORDER BY due_at ASC
  `, [studentId]);

  const rows = result.rows;
  const individual = rows.filter((r) => r.completion_type === 'INDIVIDUAL');
  const group = rows.filter((r) => r.completion_type === 'GROUP');

  return {
    totals: {
      assigned: rows.length,
      confirmed: rows.filter((r) => r.display_status === 'COMPLETED' || r.display_status === 'COMPLETED_LATE').length,
      pending: rows.filter((r) => r.display_status === 'PENDING').length,
      overdue: rows.filter((r) => r.display_status === 'OVERDUE').length,
      completionPercent: rows.length ? Math.round((rows.filter((r) => r.display_status === 'COMPLETED' || r.display_status === 'COMPLETED_LATE').length / rows.length) * 100) : 0,
      individualAssigned: individual.length,
      individualConfirmed: individual.filter((r) => r.individually_confirmed).length,
      groupAssigned: group.length,
      groupSubmitted: group.filter((r) => r.group_submitted).length,
    },
    assignments: rows,
  };
}

export async function getGroupProgress(groupId, studentId) {
  const result = await pool.query(`
    SELECT g.id AS group_id, g.name AS group_name, a.id AS assignment_id, a.title, a.due_at,
      gs.submitted_at, COUNT(DISTINCT ts.student_id)::int AS eligible_member_count,
      COUNT(DISTINCT sc.target_student_id)::int AS individual_confirmations,
      CASE
        WHEN gs.id IS NOT NULL AND gs.submitted_at > a.due_at THEN 'COMPLETED_LATE'
        WHEN gs.id IS NOT NULL THEN 'COMPLETED'
        WHEN a.due_at < NOW() THEN 'OVERDUE'
        ELSE 'PENDING'
      END AS display_status
    FROM groups g
    JOIN group_members viewer ON viewer.group_id = g.id AND viewer.student_id = $2 AND viewer.status = 'ACTIVE'
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
