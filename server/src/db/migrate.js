import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from './pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function migrate() {
  const { rows } = await pool.query(
    "SELECT EXISTS (SELECT FROM pg_catalog.pg_tables WHERE tablename = 'schema_migrations' AND schemaname = 'public')"
  )
  if (!rows[0].exists) {
    await pool.query(
      `CREATE TABLE public.schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
    console.log('[migrate] Created schema_migrations tracking table')
  }

  const migrationsDir = path.join(__dirname, 'migrations')
  if (!fs.existsSync(migrationsDir)) {
    console.warn('[migrate] No migrations directory found')
    return
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.match(/^\d+.+\.sql$/))
    .sort()

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    const existing = await pool.query('SELECT 1 FROM public.schema_migrations WHERE version = $1', [version])
    if (existing.rows.length) continue

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    try {
      await pool.query(sql)
      await pool.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [version])
      console.log(`[migrate] Applied: ${file}`)
    } catch (err) {
      console.error(`[migrate] Failed: ${file}:`, err.message)
      throw err
    }
  }
}
