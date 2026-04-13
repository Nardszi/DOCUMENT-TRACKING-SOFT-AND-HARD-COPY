import cron from 'node-cron'
import pool from '../db/pool.js'
import { createNotificationsForDept } from '../services/notification.service.js'

async function alreadySentToday(documentId, eventType) {
  const { rows } = await pool.query(
    `SELECT 1 FROM notifications
     WHERE document_id = $1 AND event_type = $2 AND created_at >= CURRENT_DATE
     LIMIT 1`,
    [documentId, eventType]
  )
  return rows.length > 0
}

async function processDeadlineApproaching() {
  const { rows: docs } = await pool.query(
    `SELECT id, tracking_number, current_department_id
     FROM documents
     WHERE deadline = CURRENT_DATE + 2 AND status != 'completed'`
  )
  for (const doc of docs) {
    const eventType = 'deadline_approaching'
    if (await alreadySentToday(doc.id, eventType)) continue
    const message = `Document '${doc.tracking_number}' deadline is in 2 days.`
    await createNotificationsForDept(pool, doc.current_department_id, doc.id, eventType, message)
  }
}

async function processDeadlinePassed() {
  const { rows: docs } = await pool.query(
    `SELECT id, tracking_number, current_department_id
     FROM documents
     WHERE deadline < CURRENT_DATE AND status != 'completed'`
  )
  for (const doc of docs) {
    const eventType = 'deadline_passed'
    if (await alreadySentToday(doc.id, eventType)) continue
    const message = `Document '${doc.tracking_number}' deadline has passed.`
    await createNotificationsForDept(pool, doc.current_department_id, doc.id, eventType, message)
  }
}

export function startDeadlineJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('[deadline.job] Running deadline checks...')
    try {
      await processDeadlineApproaching()
      await processDeadlinePassed()
      console.log('[deadline.job] Deadline checks complete.')
    } catch (err) {
      console.error('[deadline.job] Error during deadline checks:', err)
    }
  })
  console.log('[deadline.job] Deadline cron job scheduled (every hour).')
}
