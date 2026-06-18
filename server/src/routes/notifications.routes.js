import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { createNotificationsForDept } from '../services/notification.service.js'
import { isEmailEnabled, sendDeadlineApproachingEmail, sendDeadlinePassedEmail } from '../services/email.service.js'

const router = Router()

// GET / — list user's non-expired notifications, newest first (Req 7.2)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, document_id, event_type, message, is_read, created_at, expires_at
         FROM notifications
        WHERE user_id = $1
          AND expires_at > NOW()
        ORDER BY created_at DESC`,
      [req.user.id]
    )
    const unread_count = rows.filter((n) => !n.is_read).length
    res.json({ notifications: rows, unread_count })
  } catch (err) {
    next(err)
  }
})

// PATCH /read-all — mark all unread as read (MUST be before /:id/read)
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE notifications SET is_read = true
        WHERE user_id = $1 AND is_read = false AND expires_at > NOW()`,
      [req.user.id]
    )
    res.json({ updated: rowCount })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id/read — mark single notification as read
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications SET is_read = true
        WHERE id = $1 AND user_id = $2
        RETURNING id, document_id, event_type, message, is_read, created_at, expires_at`,
      [req.params.id, req.user.id]
    )
    if (!rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found.' } })
    }
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /check-deadlines — check and notify about approaching/passed deadlines
// Intended to be called by an external cron job, or manually by an admin
router.post('/check-deadlines', authenticate, async (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin only.' } })
  try {
    const approaching = await pool.query(
      `SELECT d.id, d.tracking_number, d.title, d.deadline, cd.name AS department_name,
              (d.deadline - CURRENT_DATE) AS days_left
       FROM documents d
       JOIN departments cd ON cd.id = d.current_department_id
       WHERE d.deadline IS NOT NULL
         AND d.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
         AND d.status != 'completed'
         AND d.is_archived = FALSE
       ORDER BY d.deadline ASC`
    )

    const passed = await pool.query(
      `SELECT d.id, d.tracking_number, d.title, d.deadline, cd.name AS department_name
       FROM documents d
       JOIN departments cd ON cd.id = d.current_department_id
       WHERE d.deadline IS NOT NULL
         AND d.deadline < CURRENT_DATE
         AND d.status != 'completed'
         AND d.is_archived = FALSE
       ORDER BY d.deadline ASC`
    )

    let notified = 0
    const emailEnabled = await isEmailEnabled()

    for (const doc of approaching.rows) {
      const notifMessage = `Document '${doc.tracking_number}' deadline is in ${doc.days_left} day(s).`
      await createNotificationsForDept(pool, null, doc.id, 'deadline_approaching', notifMessage)
      notified++

      if (emailEnabled) {
        const users = await pool.query('SELECT email FROM users WHERE department_id = (SELECT current_department_id FROM documents WHERE id = $1) AND is_active = TRUE', [doc.id])
        for (const u of users.rows) {
          if (!u.email) continue
          sendDeadlineApproachingEmail(u.email, {
            documentTitle: doc.title,
            trackingNumber: doc.tracking_number,
            deadline: doc.deadline,
            daysLeft: doc.days_left,
            department: doc.department_name,
            documentId: doc.id,
          }).catch(err => console.warn('[deadline] email failed:', err.message))
        }
      }
    }

    for (const doc of passed.rows) {
      const notifMessage = `Document '${doc.tracking_number}' is OVERDUE. Deadline was ${doc.deadline}.`
      await createNotificationsForDept(pool, null, doc.id, 'deadline_passed', notifMessage)
      notified++

      if (emailEnabled) {
        const users = await pool.query('SELECT email FROM users WHERE department_id = (SELECT current_department_id FROM documents WHERE id = $1) AND is_active = TRUE', [doc.id])
        for (const u of users.rows) {
          if (!u.email) continue
          sendDeadlinePassedEmail(u.email, {
            documentTitle: doc.title,
            trackingNumber: doc.tracking_number,
            deadline: doc.deadline,
            department: doc.department_name,
            documentId: doc.id,
          }).catch(err => console.warn('[deadline] email failed:', err.message))
        }
      }
    }

    res.json({ approaching: approaching.rows.length, passed: passed.rows.length, notified })
  } catch (err) { next(err) }
})

export default router
