import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from '../db/pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads')

async function findOrphanedFiles() {
  const { rows } = await pool.query('SELECT storage_path FROM attachments')
  const dbPaths = new Set(rows.map(r => r.storage_path))
  const orphaned = []

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(fullPath)
      } else {
        const relative = path.relative(UPLOADS_DIR, fullPath).replace(/\\/g, '/')
        if (!dbPaths.has(relative)) {
          orphaned.push(fullPath)
        }
      }
    }
  }

  scanDir(UPLOADS_DIR)
  return orphaned
}

async function deleteOrphanedFiles() {
  const orphaned = await findOrphanedFiles()
  let deleted = 0

  for (const filePath of orphaned) {
    try {
      await fs.promises.unlink(filePath)
      deleted++
    } catch {
      // File may already be deleted or permission denied
    }
  }

  return { total: orphaned.length, deleted }
}

async function cleanupEmptyDirectories() {
  function removeEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        removeEmptyDirs(path.join(dir, entry.name))
      }
    }
    const remaining = fs.readdirSync(dir)
    if (remaining.length === 0 && dir !== UPLOADS_DIR) {
      fs.rmdirSync(dir)
    }
  }
  removeEmptyDirs(UPLOADS_DIR)
}

export function startFileCleanupJob() {
  cron.schedule('0 4 * * 0', async () => {
    console.log('[cleanup-files.job] Running orphaned file cleanup...')
    try {
      const result = await deleteOrphanedFiles()
      if (result.total > 0) {
        console.log(`[cleanup-files.job] Found ${result.total} orphaned file(s), deleted ${result.deleted}.`)
      }
      await cleanupEmptyDirectories()
      console.log('[cleanup-files.job] Done.')
    } catch (err) {
      console.error('[cleanup-files.job] Error:', err.message)
    }
  })
  console.log('[cleanup-files.job] Scheduled (weekly Sunday at 4 AM).')
}
