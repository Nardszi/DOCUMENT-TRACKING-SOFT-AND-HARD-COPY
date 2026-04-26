/**
 * Migration runner for NONECO Document Tracking System.
 *
 * Can be used two ways:
 *   1. CLI:    node src/db/migrations/migrate.js
 *              npm run db:migrate  (from server/)
 *   2. Import: import { runMigrations } from './migrate.js'
 *              await runMigrations()   ← called automatically on server startup
 */

import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function makePool() {
  return new Pool(
    process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes('railway') || process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_NAME || 'noneco_docs',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
        }
  )
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT filename FROM migrations ORDER BY filename')
  return new Set(result.rows.map((r) => r.filename))
}

async function applyMigration(client, filename, sql) {
  console.log(`  Applying ${filename}...`)
  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query('INSERT INTO migrations (filename) VALUES ($1)', [filename])
    await client.query('COMMIT')
    console.log(`  ✓ ${filename}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}

// ── Exported function — called by server.js on startup ───────────────────────
export async function runMigrations() {
  const pool = makePool()
  const client = await pool.connect()
  try {
    await ensureMigrationsTable(client)
    const applied = await getAppliedMigrations(client)

    const files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const pending = files.filter((f) => !applied.has(f))

    if (pending.length === 0) {
      console.log('[migrations] All up to date.')
      return
    }

    console.log(`[migrations] Running ${pending.length} pending migration(s)…`)
    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(__dirname, filename), 'utf8')
      await applyMigration(client, filename, sql)
    }
    console.log('[migrations] All migrations applied successfully.')
  } finally {
    client.release()
    await pool.end()
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────
// Only runs when executed directly: node migrate.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err.message)
    process.exit(1)
  })
}
