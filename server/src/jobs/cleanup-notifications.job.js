import cron from 'node-cron'
import pool from '../db/pool.js'

async function deleteExpiredNotifications() {
  const { rowCount } = await pool.query(
    `DELETE FROM notifications WHERE expires_at < NOW()`
  )
  return rowCount
}

async function deleteOldReadNotifications() {
  const { rowCount } = await pool.query(
    `DELETE FROM notifications
     WHERE is_read = TRUE
       AND created_at < NOW() - INTERVAL '30 days'`
  )
  return rowCount
}

export function startNotificationCleanupJob() {
  cron.schedule('0 3 * * *', async () => {
    console.log('[cleanup-notifications.job] Running notification cleanup...')
    try {
      const expired = await deleteExpiredNotifications()
      const oldRead = await deleteOldReadNotifications()
      const total = expired + oldRead
      if (total > 0) {
        console.log(`[cleanup-notifications.job] Deleted ${expired} expired + ${oldRead} old read notifications.`)
      }
      console.log('[cleanup-notifications.job] Done.')
    } catch (err) {
      console.error('[cleanup-notifications.job] Error:', err.message)
    }
  })
  console.log('[cleanup-notifications.job] Scheduled (daily at 3 AM).')
}
