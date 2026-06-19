import cron from 'node-cron'
import pool from '../db/pool.js'

async function deleteExpiredPasswordResetTokens() {
  const { rowCount } = await pool.query(
    `DELETE FROM password_reset_tokens WHERE expires_at < NOW()`
  )
  return rowCount
}

async function deleteOldSessions() {
  const { rowCount } = await pool.query(
    `DELETE FROM password_reset_tokens
     WHERE created_at < NOW() - INTERVAL '7 days'`
  )
  return rowCount
}

export function startTokenCleanupJob() {
  cron.schedule('0 3 * * *', async () => {
    console.log('[cleanup-tokens.job] Running token cleanup...')
    try {
      const expired = await deleteExpiredPasswordResetTokens()
      const old = await deleteOldSessions()
      const total = expired + old
      if (total > 0) {
        console.log(`[cleanup-tokens.job] Cleaned up ${total} token(s).`)
      }
      console.log('[cleanup-tokens.job] Done.')
    } catch (err) {
      console.error('[cleanup-tokens.job] Error:', err.message)
    }
  })
  console.log('[cleanup-tokens.job] Scheduled (daily at 3 AM).')
}
