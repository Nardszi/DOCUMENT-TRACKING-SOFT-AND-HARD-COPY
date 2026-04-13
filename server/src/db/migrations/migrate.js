/**
 * Migration runner for NONECO Document Tracking System.
 *
 * Reads all *.sql files from this directory in lexicographic order,
 * tracks applied migrations in a `migrations` table, and runs only
 * pending ones — each in its own transaction.
 *
 * Usage:  node src/db/migrations/migrate.js
 *         npm run db:migrate  (from server/)
 */

import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'noneco_docs',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
)

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

async function runMigration(client, filename, sql) {
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

async function main() {
  const client = await pool.connect()
  try {
    // Ensure migrations tracking table exists
    await ensureMigrationsTable(client)

    // Get already-applied migrations
    const applied = await getAppliedMigrations(client)

    // Find all .sql files in this directory, sorted lexicographically
    const files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const pending = files.filter((f) => !applied.has(f))

    if (pending.length === 0) {
      console.log('No pending migrations.')
      return
    }

    console.log(`Running ${pending.length} migration(s)...`)

    for (const filename of pending) {
      const filepath = path.join(__dirname, filename)
      const sql = fs.readFileSync(filepath, 'utf8')
      await runMigration(client, filename, sql)
    }

    console.log('All migrations applied successfully.')
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
