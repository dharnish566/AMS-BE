import { pool } from '../../config/database.js';

const safeUserColumns = 'id, full_name, email, student_id, role, created_at, updated_at';

export async function findUserByEmail(email, client = pool) {
  const result = await client.query(`SELECT ${safeUserColumns}, password_hash FROM users WHERE email = $1`, [email]);
  return result.rows[0] ?? null;
}

export async function findSafeUserById(id, client = pool) {
  const result = await client.query(`SELECT ${safeUserColumns} FROM users WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createStudent({ fullName, email, studentId, passwordHash }, client = pool) {
  const result = await client.query(`
    INSERT INTO users (full_name, email, student_id, password_hash, role)
    VALUES ($1, $2, $3, $4, 'STUDENT')
    RETURNING ${safeUserColumns}
  `, [fullName, email, studentId, passwordHash]);
  return result.rows[0];
}
