import cron from 'node-cron'
import pool from '../db/pool.js'

const ARCHIVE_DAYS = parseInt(process.env.AUTO_ARCHIVE_DAYS || '30', 10)

async function archiveCompletedDocuments() {
  const { rowCount } = await pool.query(
    `UPDATE documents
     SET is_archived = TRUE, updated_at = NOW()
     WHERE status = 'completed'
       AND is_archived = FALSE
       AND updated_at < NOW() - INTERVAL '1 day' * $1`,
    [ARCHIVE_DAYS]
  )
  return rowCount
}

async function unarchiveStaleForwardedDocuments() {
  const { rowCount } = await pool.query(
    `UPDATE documents
     SET is_archived = FALSE, updated_at = NOW()
     WHERE is_archived = TRUE
       AND status = 'forwarded'
       AND updated_at > NOW() - INTERVAL '7 days'`
  )
  return rowCount
}

export function startAutoArchiveJob() {
  cron.schedule('0 2 * * *', async () => {
    console.log('[auto-archive.job] Running auto-archive checks...')
    try {
      const archived = await archiveCompletedDocuments()
      if (archived > 0) {
        console.log(`[auto-archive.job] Archived ${archived} completed document(s) older than ${ARCHIVE_DAYS} days.`)
      }
      const unarchived = await unarchiveStaleForwardedDocuments()
      if (unarchived > 0) {
        console.log(`[auto-archive.job] Unarchived ${unarchived} forwarded document(s).`)
      }
      console.log('[auto-archive.job] Done.')
    } catch (err) {
      console.error('[auto-archive.job] Error:', err.message)
    }
  })
  console.log(`[auto-archive.job] Scheduled (daily at 2 AM, archive after ${ARCHIVE_DAYS} days).`)
}
