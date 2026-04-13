import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'

const router = Router()

const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent']

// GET / — list templates; non-admin sees active only, admin sees all
router.get('/', authenticate, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const query = isAdmin
      ? `SELECT id, name, title_prefix, category_id, originating_department_id,
                description, priority, is_active, created_by, created_at, updated_at
           FROM document_templates ORDER BY name ASC`
      : `SELECT id, name, title_prefix, category_id, originating_department_id,
                description, priority, is_active, created_by, created_at, updated_at
           FROM document_templates WHERE is_active = true ORDER BY name ASC`

    const { rows } = await pool.query(query)
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST / — admin only; create a new template
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  const { name, title_prefix, category_id, originating_department_id, description, priority, is_active } = req.body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'name is required.' },
    })
  }

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.` },
    })
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO document_templates
         (name, title_prefix, category_id, originating_department_id, description, priority, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, title_prefix, category_id, originating_department_id,
                 description, priority, is_active, created_by, created_at, updated_at`,
      [
        name.trim(),
        title_prefix ?? null,
        category_id ?? null,
        originating_department_id ?? null,
        description ?? null,
        priority ?? 'normal',
        is_active !== undefined ? is_active : true,
        req.user.id,
      ]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
})

// PATCH /:id — admin only; update allowed fields
router.patch('/:id', authenticate, requireAdmin, async (req, res, next) => {
  const { id } = req.params
  const { name, title_prefix, category_id, originating_department_id, description, priority, is_active } = req.body

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.` },
    })
  }

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
  if (title_prefix !== undefined) { fields.push(`title_prefix = $${idx++}`); values.push(title_prefix) }
  if (category_id !== undefined) { fields.push(`category_id = $${idx++}`); values.push(category_id) }
  if (originating_department_id !== undefined) { fields.push(`originating_department_id = $${idx++}`); values.push(originating_department_id) }
  if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description) }
  if (priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(priority) }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active) }

  if (fields.length === 0) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'No updatable fields provided.' },
    })
  }

  fields.push(`updated_at = NOW()`)
  values.push(id)

  try {
    const { rows } = await pool.query(
      `UPDATE document_templates SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, title_prefix, category_id, originating_department_id,
                 description, priority, is_active, created_by, created_at, updated_at`,
      values
    )

    if (!rows.length) {
      return res.status(404).json({
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' },
      })
    }

    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

export default router
