import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'

const router = Router()

// GET / — list categories (any authenticated user)
// Optional ?active_only=true to filter only active categories
router.get('/', authenticate, async (req, res, next) => {
  try {
    const activeOnly = req.query.active_only === 'true'
    const query = activeOnly
      ? 'SELECT id, name, is_active FROM document_categories WHERE is_active = true ORDER BY name ASC'
      : 'SELECT id, name, is_active FROM document_categories ORDER BY name ASC'

    const { rows } = await pool.query(query)
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST / — create category (Admin only)
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  const { name } = req.body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'name is required.' },
    })
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO document_categories (name)
       VALUES ($1)
       RETURNING id, name, is_active`,
      [name.trim()]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'A category with that name already exists.' },
      })
    }
    next(err)
  }
})

// PATCH /:id — update category (Admin only)
router.patch('/:id', authenticate, requireAdmin, async (req, res, next) => {
  const { id } = req.params
  const { name, is_active } = req.body

  const fields = []
  const values = []
  let idx = 1

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'name must be a non-empty string.' },
      })
    }
    fields.push(`name = $${idx++}`)
    values.push(name.trim())
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'is_active must be a boolean.' },
      })
    }
    fields.push(`is_active = $${idx++}`)
    values.push(is_active)
  }

  if (fields.length === 0) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'No updatable fields provided.' },
    })
  }

  values.push(id)

  try {
    const { rows } = await pool.query(
      `UPDATE document_categories SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, is_active`,
      values
    )

    if (!rows.length) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Category not found.' },
      })
    }

    res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'A category with that name already exists.' },
      })
    }
    next(err)
  }
})

export default router
