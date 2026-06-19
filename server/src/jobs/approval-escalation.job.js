import cron from 'node-cron'
import pool from '../db/pool.js'
import { createNotificationsForDept } from '../services/notification.service.js'

const ESCALATE_DAYS = parseInt(process.env.APPROVAL_ESCALATE_DAYS || '5', 10)

async function escalatePendingApprovals() {
  const { rows: pending } = await pool.query(
    `SELECT da.id, da.document_id, da.step_order, da.label,
            d.tracking_number, d.title, d.current_department_id,
            dept.name AS dept_name,
            da.decided_at,
            (NOW() - da.assigned_at) AS pending_duration
     FROM document_approvals da
     JOIN documents d ON d.id = da.document_id
     JOIN departments dept ON dept.id = d.current_department_id
     WHERE da.status = 'pending'
       AND da.assigned_at < NOW() - INTERVAL '1 day' * $1
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.document_id = da.document_id
           AND n.event_type = 'approval_escalated'
           AND n.created_at >= NOW() - INTERVAL '7 days'
       )`,
    [ESCALATE_DAYS]
  )

  const { rows: admins } = await pool.query(
    `SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE`
  )

  let escalated = 0
  for (const step of pending) {
    const days = Math.floor(step.pending_duration / 86400000) || ESCALATE_DAYS
    const message = `APPROVAL ESCALATION: Step '${step.label}' for document '${step.tracking_number}' has been pending for ${days} day(s).`
    for (const admin of admins) {
      await createNotificationsForDept(pool, null, step.document_id, 'approval_escalated', message)
    }
    escalated++
  }

  return escalated
}

export function startApprovalEscalationJob() {
  cron.schedule('0 10 * * 1-5', async () => {
    console.log('[approval-escalation.job] Running approval escalation...')
    try {
      const count = await escalatePendingApprovals()
      if (count > 0) {
        console.log(`[approval-escalation.job] Escalated ${count} pending approval step(s) to admins.`)
      }
      console.log('[approval-escalation.job] Done.')
    } catch (err) {
      console.error('[approval-escalation.job] Error:', err.message)
    }
  })
  console.log(`[approval-escalation.job] Scheduled (weekdays at 10 AM, escalate after ${ESCALATE_DAYS} days).`)
}
