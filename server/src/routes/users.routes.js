import { Router } from 'express'
import bcrypt from 'bcrypt'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import { recordAudit } from '../utils/audit.js'

const router = Router()

// All user management routes require authentication + admin role
router.use(authenticate, requireAdmin)

// GET / — list all users (exclude password_hash)
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, full_name, role, department_id, is_active, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST / — create a new user
router.post('/', async (req, res, next) => {
  const { username, password, email, full_name, role, department_id } = req.body

  if (!username || !password || !email || !full_name || !role || !department_id) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'username, password, email, full_name, role, and department_id are required.' },
    })
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: { code: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' },
    })
  }

  const validRoles = ['staff', 'department_head', 'admin']
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      error: { code: 'INVALID_ROLE', message: `Role must be one of: ${validRoles.join(', ')}.` },
    })
  }

  try {
    // Validate department exists
    const deptResult = await pool.query('SELECT id FROM departments WHERE id = $1', [department_id])
    if (!deptResult.rows.length) {
      return res.status(400).json({
        error: { code: 'INVALID_DEPARTMENT', message: 'The specified department does not exist.' },
      })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, email, full_name, role, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, full_name, role, department_id, is_active, created_at, updated_at`,
      [username, password_hash, email, full_name, role, department_id]
    )

    res.status(201).json(rows[0])
    recordAudit(pool, req.user.id, 'user.created', 'user', rows[0].id, { username, role })
  } catch (err) {
    if (err.code === '23505') {
      // Unique constraint violation
      const field = err.constraint?.includes('email') ? 'email' : 'username'
      return res.status(409).json({
        error: { code: 'CONFLICT', message: `A user with that ${field} already exists.` },
      })
    }
    next(err)
  }
})

// PATCH /:id — update user fields
router.patch('/:id', async (req, res, next) => {
  const { id } = req.params
  const { email, full_name, role, department_id } = req.body

  const validRoles = ['staff', 'department_head', 'admin']
  if (role !== undefined && !validRoles.includes(role)) {
    return res.status(400).json({
      error: { code: 'INVALID_ROLE', message: `Role must be one of: ${validRoles.join(', ')}.` },
    })
  }

  try {
    // Validate department if provided
    if (department_id !== undefined) {
      const deptResult = await pool.query('SELECT id FROM departments WHERE id = $1', [department_id])
      if (!deptResult.rows.length) {
        return res.status(400).json({
          error: { code: 'INVALID_DEPARTMENT', message: 'The specified department does not exist.' },
        })
      }
    }

    // Build dynamic SET clause
    const fields = []
    const values = []
    let idx = 1

    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email) }
    if (full_name !== undefined) { fields.push(`full_name = $${idx++}`); values.push(full_name) }
    if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role) }
    if (department_id !== undefined) { fields.push(`department_id = $${idx++}`); values.push(department_id) }

    if (fields.length === 0) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'No updatable fields provided.' },
      })
    }

    fields.push(`updated_at = NOW()`)
    values.push(id)

    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, username, email, full_name, role, department_id, is_active, created_at, updated_at`,
      values
    )

    if (!rows.length) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found.' },
      })
    }

    res.json(rows[0])
    const changedFields = {}
    if (email !== undefined) changedFields.email = email
    if (full_name !== undefined) changedFields.full_name = full_name
    if (role !== undefined) changedFields.role = role
    if (department_id !== undefined) changedFields.department_id = department_id
    recordAudit(pool, req.user.id, 'user.updated', 'user', id, { changed_fields: Object.keys(changedFields) })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'A user with that email already exists.' },
      })
    }
    next(err)
  }
})

// PATCH /:id/deactivate — deactivate a user
router.patch('/:id/deactivate', async (req, res, next) => {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1
       RETURNING id, username, email, full_name, role, department_id, is_active, created_at, updated_at`,
      [id]
    )

    if (!rows.length) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found.' },
      })
    }

    res.json(rows[0])
    recordAudit(pool, req.user.id, 'user.deactivated', 'user', id, null)
  } catch (err) {
    next(err)
  }
})

export default router
