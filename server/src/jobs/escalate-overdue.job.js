import cron from 'node-cron'
import pool from '../db/pool.js'
import { createNotificationsForDept } from '../services/notification.service.js'

const ESCALATE_DAYS = parseInt(process.env.OVERDUCE_ESCALATE_DAYS || '3', 10)

async function escalateOverdueDocuments() {
  const { rows: docs } = await pool.query(
    `SELECT d.id, d.tracking_number, d.title, d.current_department_id,
            dept.name AS dept_name, dept.code AS dept_code, d.deadline,
            (CURRENT_DATE - d.deadline) AS days_overdue
     FROM documents d
     JOIN departments dept ON dept.id = d.current_department_id
     WHERE d.deadline < CURRENT_DATE - INTERVAL '1 day' * $1
       AND d.status != 'completed'
       AND d.is_archived = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.document_id = d.id
           AND n.event_type = 'overdue_escalated'
           AND n.created_at >= NOW() - INTERVAL '7 days'
       )`,
    [ESCALATE_DAYS]
  )

  const { rows: admins } = await pool.query(
    `SELECT id, email FROM users WHERE role = 'admin' AND is_active = TRUE`
  )

  let escalated = 0
  for (const doc of docs) {
    const message = `OVERDUE ESCALATION: Document '${doc.tracking_number}' has been overdue for ${doc.days_overdue} day(s) in ${doc.dept_name}.`
    for (const admin of admins) {
      await createNotificationsForDept(pool, null, doc.id, 'overdue_escalated', message)
    }
    escalated++
  }

  return escalated
}

export function startEscalateOverdueJob() {
  cron.schedule('0 9 * * 1-5', async () => {
    console.log('[escalate-overdue.job] Running overdue escalation...')
    try {
      const count = await escalateOverdueDocuments()
      if (count > 0) {
        console.log(`[escalate-overdue.job] Escalated ${count} overdue document(s) to admins.`)
      }
      console.log('[escalate-overdue.job] Done.')
    } catch (err) {
      console.error('[escalate-overdue.job] Error:', err.message)
    }
  })
  console.log(`[escalate-overdue.job] Scheduled (weekdays at 9 AM, escalate after ${ESCALATE_DAYS} days overdue).`)
}
