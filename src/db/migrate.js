import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../config/database.js';

const migrationsDirectory = path.dirname(fileURLToPath(import.meta.url)) + '/migrations';

async function ensureMigrationsTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function migrationFiles() {
  return (await fs.readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
}

async function rollbackFile(version) {
  return path.join(migrationsDirectory, 'rollback', version);
}

async function migrate(command) {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const existingSchema = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS initialized`);
    if (existingSchema.rows[0].initialized) {
      await client.query(`INSERT INTO schema_migrations (version) VALUES ('001_initial_schema.sql') ON CONFLICT DO NOTHING`);
    }
    const files = await migrationFiles();
    const applied = await client.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedVersions = new Set(applied.rows.map((row) => row.version));

    if (command === 'status') {
      for (const file of files) console.log(`${appliedVersions.has(file) ? 'applied' : 'pending'} ${file}`);
      return;
    }

    if (command === 'down') {
      const last = await client.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
      if (!last.rowCount || last.rows[0].version === '001_initial_schema.sql') return;
      const version = last.rows[0].version;
      await client.query('BEGIN');
      try {
        await client.query(await fs.readFile(await rollbackFile(version), 'utf8'));
        await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
        await client.query('COMMIT');
        console.log(`rolled back ${version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      return;
    }

    for (const file of files) {
      if (appliedVersions.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(await fs.readFile(path.join(migrationsDirectory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate(process.argv[2] ?? 'up').catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
