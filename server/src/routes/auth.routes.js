import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { recordAudit } from '../utils/audit.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Username and password are required.' } })
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, role, department_id, full_name, is_active FROM users WHERE username = $1',
      [username]
    )

    const user = rows[0]
    if (!user) {
      await recordAudit(pool, null, 'user.login.failure', 'user', null, { username })
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' } })
    }

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      await recordAudit(pool, user.id, 'user.login.failure', 'user', user.id, { username })
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' } })
    }

    if (!user.is_active) {
      await recordAudit(pool, user.id, 'user.login.failure', 'user', user.id, { username })
      return res.status(401).json({ error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account has been deactivated.' } })
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, departmentId: user.department_id, fullName: user.full_name },
      JWT_SECRET,
      { expiresIn: '30m' }
    )

    recordAudit(pool, user.id, 'user.login.success', 'user', user.id, { username })
    res.json({ token })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  recordAudit(pool, req.user.id, 'user.logout', 'user', req.user.id, null)
  res.json({ message: 'Logged out successfully' })
})

// POST /api/auth/reset-password-request
router.post('/reset-password-request', async (req, res, next) => {
  const { email } = req.body
  const safeResponse = { message: 'If that email exists, a reset link has been sent.' }

  if (!email) {
    return res.json(safeResponse)
  }

  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (!rows.length) {
      return res.json(safeResponse)
    }

    const userId = rows[0].id
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Remove any existing tokens for this user before inserting a new one
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId])
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    )

    // In a real system, send rawToken via email here.
    // For now, we just store the hash.

    res.json(safeResponse)
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  const { token, newPassword } = req.body

  if (!token || !newPassword) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Token and newPassword are required.' } })
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: { code: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' } })
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const { rows } = await pool.query(
      'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    )

    if (!rows.length) {
      return res.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token is invalid or has expired.' } })
    }

    const { id: tokenId, user_id: userId } = rows[0]
    const passwordHash = await bcrypt.hash(newPassword, 10)

    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId])
    await pool.query('DELETE FROM password_reset_tokens WHERE id = $1', [tokenId])

    res.json({ message: 'Password has been reset successfully.' })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/change-password (authenticated)
router.post('/change-password', authenticate, async (req, res, next) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'current_password and new_password are required.' } })
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: { code: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' } })
  }
  try {
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
    if (!rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } })
    const match = await bcrypt.compare(current_password, rows[0].password_hash)
    if (!match) return res.status(400).json({ error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect.' } })
    const hash = await bcrypt.hash(new_password, 10)
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id])
    res.json({ message: 'Password changed successfully.' })
  } catch (err) { next(err) }
})

export default router
