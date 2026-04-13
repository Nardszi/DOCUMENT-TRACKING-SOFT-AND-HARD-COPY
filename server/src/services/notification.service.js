import pool from '../db/pool.js'
import { sseManager } from '../sse/sseManager.js'
import { isEmailEnabled, sendNotificationEmail } from './email.service.js'

const EMAIL_EVENT_TYPES = new Set([
  'document_forwarded',
  'document_returned',
  'deadline_approaching',
  'deadline_passed',
  'document_urgent',
])

export async function createNotification(userId, documentId, eventType, message) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, document_id, event_type, message, is_read, expires_at)
     VALUES ($1, $2, $3, $4, FALSE, NOW() + INTERVAL '30 days')
     RETURNING id, user_id, document_id, event_type, message, is_read, created_at, expires_at`,
    [userId, documentId, eventType, message]
  )
  const notification = rows[0]
  try { sseManager.push(userId, { type: 'notification', notification }) } catch {}
  return notification
}

export async function createNotificationsForDept(pool_or_ignored, departmentId, documentId, eventType, message) {
  const { rows: users } = await pool.query(
    'SELECT id, email FROM users WHERE department_id = $1 AND is_active = TRUE',
    [departmentId]
  )
  for (const user of users) {
    await createNotification(user.id, documentId, eventType, message)
  }

  // Send emails for relevant event types (best-effort)
  if (EMAIL_EVENT_TYPES.has(eventType)) {
    try {
      const emailEnabled = await isEmailEnabled()
      if (emailEnabled) {
        const { rows: docs } = await pool.query(
          'SELECT title, tracking_number, status FROM documents WHERE id = $1',
          [documentId]
        )
        if (docs.length) {
          const doc = docs[0]
          const subject = `[NONECO DTS] ${message}`
          for (const user of users) {
            if (!user.email) continue
            try {
              await sendNotificationEmail(user.email, subject, {
                documentTitle: doc.title,
                trackingNumber: doc.tracking_number,
                status: doc.status,
                eventType,
              })
            } catch (err) {
              console.warn(`[email] Failed to send to ${user.email}:`, err.message)
            }
          }
        }
      }
    } catch (err) {
      console.warn('[email] Error during email notification dispatch:', err.message)
    }
  }
}
