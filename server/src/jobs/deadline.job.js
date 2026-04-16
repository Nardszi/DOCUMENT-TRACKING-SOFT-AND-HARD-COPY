import cron from 'node-cron'
import pool from '../db/pool.js'
import { createNotificationsForDept } from '../services/notification.service.js'
import { isEmailEnabled, sendDeadlineApproachingEmail, sendDeadlinePassedEmail } from '../services/email.service.js'

async function alreadySentToday(documentId, eventType) {
  const { rows } = await pool.query(
    `SELECT 1 FROM notifications
     WHERE document_id = $1 AND event_type = $2 AND created_at >= CURRENT_DATE
     LIMIT 1`,
    [documentId, eventType]
  )
  return rows.length > 0
}

async function getUsersInDept(departmentId) {
  const { rows } = await pool.query(
    'SELECT id, email FROM users WHERE department_id = $1 AND is_active = TRUE',
    [departmentId]
  )
  return rows
}

async function processDeadlineApproaching() {
  // Warn 3 days and 1 day before deadline
  const { rows: docs } = await pool.query(
    `SELECT d.id, d.tracking_number, d.title, d.current_department_id,
            dept.name AS dept_name,
            d.deadline,
            (d.deadline - CURRENT_DATE) AS days_left
     FROM documents d
     JOIN departments dept ON dept.id = d.current_department_id
     WHERE d.deadline BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 3
       AND d.status != 'completed'`
  )

  const emailEnabled = await isEmailEnabled()

  for (const doc of docs) {
    const eventType = 'deadline_approaching'
    if (await alreadySentToday(doc.id, eventType)) continue

    const daysLeft = parseInt(doc.days_left)
    const message = `Document '${doc.tracking_number}' deadline is in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${doc.deadline}).`
    await createNotificationsForDept(pool, doc.current_department_id, doc.id, eventType, message)

    if (emailEnabled) {
      const users = await getUsersInDept(doc.current_department_id)
      for (const user of users) {
        if (!user.email) continue
        try {
          await sendDeadlineApproachingEmail(user.email, {
            documentTitle: doc.title,
            trackingNumber: doc.tracking_number,
            deadline: new Date(doc.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            daysLeft,
            department: doc.dept_name,
            documentId: doc.id,
          })
        } catch (err) {
          console.warn(`[deadline.job] Email failed for ${user.email}:`, err.message)
        }
      }
    }
  }
}

async function processDeadlinePassed() {
  const { rows: docs } = await pool.query(
    `SELECT d.id, d.tracking_number, d.title, d.current_department_id,
            dept.name AS dept_name, d.deadline
     FROM documents d
     JOIN departments dept ON dept.id = d.current_department_id
     WHERE d.deadline < CURRENT_DATE AND d.status != 'completed'`
  )

  const emailEnabled = await isEmailEnabled()

  for (const doc of docs) {
    const eventType = 'deadline_passed'
    if (await alreadySentToday(doc.id, eventType)) continue

    const message = `Document '${doc.tracking_number}' is OVERDUE. Deadline was ${doc.deadline}.`
    await createNotificationsForDept(pool, doc.current_department_id, doc.id, eventType, message)

    if (emailEnabled) {
      const users = await getUsersInDept(doc.current_department_id)
      for (const user of users) {
        if (!user.email) continue
        try {
          await sendDeadlinePassedEmail(user.email, {
            documentTitle: doc.title,
            trackingNumber: doc.tracking_number,
            deadline: new Date(doc.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            department: doc.dept_name,
            documentId: doc.id,
          })
        } catch (err) {
          console.warn(`[deadline.job] Email failed for ${user.email}:`, err.message)
        }
      }
    }
  }
}

export function startDeadlineJob() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[deadline.job] Running deadline checks…')
    try {
      await processDeadlineApproaching()
      await processDeadlinePassed()
      console.log('[deadline.job] Deadline checks complete.')
    } catch (err) {
      console.error('[deadline.job] Error:', err.message)
    }
  })
  console.log('[deadline.job] Scheduled (every hour).')
}
