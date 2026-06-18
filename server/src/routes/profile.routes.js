import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.patch('/', authenticate, async (req, res, next) => {
  const { full_name } = req.body
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'full_name is required.' } })
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, username, email, full_name, role, department_id, is_active`,
      [full_name.trim(), req.user.id]
    )
    if (!rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } })
    }
    const user = rows[0]
    const token = req.headers.authorization?.slice(7)
    if (token) {
      const jwt = await import('jsonwebtoken')
      const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
      const decoded = jwt.default.verify(token, JWT_SECRET)
      const newToken = jwt.default.sign(
        { sub: user.id, role: user.role, departmentId: user.department_id, fullName: user.full_name },
        JWT_SECRET,
        { expiresIn: '30m' }
      )
      return res.json({ user, token: newToken })
    }
    res.json({ user })
  } catch (err) { next(err) }
})

export default router
