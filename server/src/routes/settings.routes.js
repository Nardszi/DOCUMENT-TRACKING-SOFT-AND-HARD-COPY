import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import pool from '../db/pool.js'

const router = Router()

// PATCH /api/settings/email-notifications — toggle email notifications (Admin only)
router.patch('/email-notifications', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: '`enabled` must be a boolean.' } })
    }
    await pool.query(
      `INSERT INTO system_settings (key, value)
       VALUES ('email_notifications_enabled', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(enabled)]
    )
    res.json({ email_notifications_enabled: enabled })
  } catch (err) {
    next(err)
  }
})

export default router
