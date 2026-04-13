import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

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

export default router
