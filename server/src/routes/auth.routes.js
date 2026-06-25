import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { z } from 'zod'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { recordAudit } from '../utils/audit.js'
import { isEmailEnabled, sendPasswordResetEmail } from '../services/email.service.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

const loginSchema = z.object({ username: z.string().min(1, 'Username is required'), password: z.string().min(1, 'Password is required') })
const registerSchema = z.object({ username: z.string().min(3, 'Username must be at least 3 characters'), password: z.string().min(8, 'Password must be at least 8 characters'), email: z.string().email('Invalid email'), full_name: z.string().min(1, 'Full name is required'), department_id: z.string().min(1, 'Department is required') })
const resetRequestSchema = z.object({ email: z.string().email('Invalid email') })
const resetSchema = z.object({ token: z.string().min(1, 'Token is required'), newPassword: z.string().min(8, 'Password must be at least 8 characters') })
const changePasswordSchema = z.object({ current_password: z.string().min(1), new_password: z.string().min(8, 'Password must be at least 8 characters') })

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.errors[0].message } })
  }
  const { username, password } = parsed.data

  try {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, role, department_id, full_name, is_active FROM users WHERE username = $1',
      [username]
    )

    const user = rows[0]
    if (!user) {
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

// POST /api/auth/refresh — issue new token if current is still valid
router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, role, department_id, full_name FROM users WHERE id = $1 AND is_active = TRUE', [req.user.id])
    if (!rows.length) return res.status(401).json({ error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account no longer active.' } })
    const u = rows[0]
    const newToken = jwt.sign(
      { sub: u.id, role: u.role, departmentId: u.department_id, fullName: u.full_name },
      JWT_SECRET,
      { expiresIn: '30m' }
    )
    res.json({ token: newToken })
  } catch (err) { next(err) }
})

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  recordAudit(pool, req.user.id, 'user.logout', 'user', req.user.id, null)
  res.json({ message: 'Logged out successfully' })
})

// POST /api/auth/reset-password-request
router.post('/reset-password-request', async (req, res, next) => {
  const safeResponse = { message: 'If that email exists, a reset link has been sent.' }
  const parsed = resetRequestSchema.safeParse(req.body)
  if (!parsed.success) return res.json(safeResponse)
  const { email } = parsed.data

  try {
    const { rows } = await pool.query('SELECT id, full_name FROM users WHERE email = $1', [email])
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

    // Send reset link via email — best-effort
    try {
      const emailEnabled = await isEmailEnabled()
      if (emailEnabled) {
        const resetUrl = `${APP_URL}/reset-password?token=${rawToken}`
        await sendPasswordResetEmail(email, {
          fullName: rows[0].full_name,
          resetUrl,
        })
      }
    } catch (emailErr) {
      console.warn('[auth] password reset email failed:', emailErr.message)
    }

    res.json(safeResponse)
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  const parsed = resetSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.errors[0].message } })
  }
  const { token, newPassword } = parsed.data

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
  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.errors[0].message } })
  }
  const { current_password, new_password } = parsed.data
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

// POST /api/auth/register — self-registration
router.post('/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: parsed.error.errors[0].message } })
  }
  const { username, password, email, full_name, department_id } = parsed.data
  try {
    const deptResult = await pool.query('SELECT id FROM departments WHERE id = $1', [department_id])
    if (!deptResult.rows.length) {
      return res.status(400).json({ error: { code: 'INVALID_DEPARTMENT', message: 'Invalid department.' } })
    }
    const password_hash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, email, full_name, role, department_id)
       VALUES ($1, $2, $3, $4, 'staff', $5)
       RETURNING id, username, email, full_name, role, department_id, is_active`,
      [username, password_hash, email, full_name, department_id]
    )
    res.status(201).json({ message: 'Account created successfully. You can now log in.' })
  } catch (err) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('email') ? 'email' : 'username'
      return res.status(409).json({ error: { code: 'CONFLICT', message: `A user with that ${field} already exists.` } })
    }
    next(err)
  }
})

export default router
