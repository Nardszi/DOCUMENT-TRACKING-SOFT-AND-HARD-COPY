import cron from 'node-cron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import dotenv from 'dotenv'

const envPath = path.resolve(process.cwd(), '.env')
dotenv.config({ path: envPath })

const execFileAsync = promisify(execFile)

const PG_DUMP = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe'
const BACKUP_DIR = 'D:/noneco-backups'
const RETENTION_DAYS = 7
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads')

function getTimestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function parseDatabaseUrl(url) {
  // postgres://user:pass@host:port/dbname?params
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.slice(1),
    user: parsed.username,
    password: parsed.password
  }
}

async function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true })
    console.log(`[backup-database.job] Created backup directory: ${BACKUP_DIR}`)
  }
}

async function runPgDump() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const db = parseDatabaseUrl(databaseUrl)
  const timestamp = getTimestamp()
  const dumpFile = path.join(BACKUP_DIR, `noneco_docs_${timestamp}.dump`)
  const manifestFile = path.join(BACKUP_DIR, `manifest_${timestamp}.json`)

  // Run pg_dump
  const env = { ...process.env, PGPASSWORD: db.password }
  const args = [
    '--host', db.host,
    '--port', db.port,
    '--username', db.user,
    '--dbname', db.database,
    '--format', 'custom',
    '--compress', '9',
    '--verbose',
    '--file', dumpFile
  ]

  console.log(`[backup-database.job] Dumping database to ${dumpFile}...`)
  const { stdout, stderr } = await execFileAsync(PG_DUMP, args, {
    env,
    timeout: 600000 // 10 min timeout
  })

  if (stderr && !stderr.includes('implementing-time-constraints')) {
    console.log(`[backup-database.job] pg_dump: ${stderr.trim()}`)
  }

  // Verify the dump file was created and has content
  const stat = await fs.promises.stat(dumpFile)
  if (stat.size === 0) {
    throw new Error('pg_dump produced an empty file')
  }
  console.log(`[backup-database.job] Dump complete: ${(stat.size / 1024 / 1024).toFixed(2)} MB`)

  // Create uploads manifest
  const manifest = await createManifest()
  await fs.promises.writeFile(manifestFile, JSON.stringify(manifest, null, 2))
  console.log(`[backup-database.job] Manifest written to ${manifestFile}`)

  return { dumpFile, manifestFile, size: stat.size }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function createManifest() {
  const files = []

  async function scanDir(dir, relativeTo) {
    if (!fs.existsSync(dir)) return
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(relativeTo, fullPath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        await scanDir(fullPath, relativeTo)
      } else {
        try {
          const stat = await fs.promises.stat(fullPath)
          files.push({
            path: relativePath,
            size: stat.size,
            modified: stat.mtime.toISOString()
          })
        } catch {
          // Skip inaccessible files
        }
      }
    }
  }

  await scanDir(UPLOADS_DIR, UPLOADS_DIR)

  return {
    created_at: new Date().toISOString(),
    total_files: files.length,
    total_size: files.reduce((sum, f) => sum + f.size, 0),
    files
  }
}

async function pruneOldBackups() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)

  const entries = await fs.promises.readdir(BACKUP_DIR)
  let deleted = 0

  for (const entry of entries) {
    // Match backup files: noneco_docs_YYYY-MM-DD_HHMMSS.dump or manifest_YYYY-MM-DD_HHMMSS.json
    const match = entry.match(/^(?:noneco_docs|manifest)_(\d{4})-(\d{2})-(\d{2})_/)
    if (!match) continue

    const fileDate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`)
    if (fileDate < cutoff) {
      const filePath = path.join(BACKUP_DIR, entry)
      try {
        await fs.promises.unlink(filePath)
        deleted++
      } catch {
        // Skip files we can't delete
      }
    }
  }

  if (deleted > 0) {
    console.log(`[backup-database.job] Pruned ${deleted} old backup file(s) (older than ${RETENTION_DAYS} days).`)
  }
}

async function runBackup() {
  await ensureBackupDir()
  const result = await runPgDump()
  await pruneOldBackups()
  return result
}

// If run directly (not imported)
const isMain = process.argv[1] && process.argv[1].endsWith('backup-database.job.js')
if (isMain) {
  console.log('[backup-database.job] Running manual backup...')
  runBackup()
    .then((r) => {
      console.log(`[backup-database.job] Manual backup complete: ${r.dumpFile}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('[backup-database.job] Manual backup failed:', err.message)
      process.exit(1)
    })
}

export function startBackupJob() {
  cron.schedule('0 1 * * *', async () => {
    console.log('[backup-database.job] Running automated backup...')
    try {
      const result = await runBackup()
      console.log(`[backup-database.job] Backup complete: ${result.dumpFile} (${(result.size / 1024 / 1024).toFixed(2)} MB)`)
    } catch (err) {
      console.error('[backup-database.job] Backup failed:', err.message)
    }
  })
  console.log('[backup-database.job] Scheduled (daily at 1 AM).')
}
