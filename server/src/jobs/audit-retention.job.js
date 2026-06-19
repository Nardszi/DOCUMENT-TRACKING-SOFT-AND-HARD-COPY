import cron from 'node-cron'
import pool from '../db/pool.js'

const RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10)

async function deleteOldAuditEntries() {
  const { rowCount } = await pool.query(
    `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [RETENTION_DAYS]
  )
  return rowCount
}

export function startAuditRetentionJob() {
  cron.schedule('0 4 1 * *', async () => {
    console.log('[audit-retention.job] Running audit log retention cleanup...')
    try {
      const deleted = await deleteOldAuditEntries()
      if (deleted > 0) {
        console.log(`[audit-retention.job] Deleted ${deleted} audit log entries older than ${RETENTION_DAYS} days.`)
      }
      console.log('[audit-retention.job] Done.')
    } catch (err) {
      console.error('[audit-retention.job] Error:', err.message)
    }
  })
  console.log(`[audit-retention.job] Scheduled (monthly 1st at 4 AM, keep ${RETENTION_DAYS} days).`)
}
