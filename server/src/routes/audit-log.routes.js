import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'

const router = Router()

// GET / — list audit log entries (Admin only)
// Query params: page, limit, from, to, action, user_id
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10))
    const offset = (page - 1) * limit

    const conditions = []
    const values = []
    let idx = 1

    if (req.query.from) {
      conditions.push('al.created_at >= $' + idx++)
      values.push(req.query.from)
    }

    if (req.query.to) {
      conditions.push('al.created_at <= $' + idx++)
      values.push(req.query.to)
    }

    if (req.query.action) {
      conditions.push('al.action ILIKE $' + idx++)
      values.push('%' + req.query.action + '%')
    }

    if (req.query.user_id) {
      // search by user UUID or partial name
      conditions.push('(al.user_id::text = $' + idx + ' OR u.full_name ILIKE $' + (idx + 1) + ')')
      values.push(req.query.user_id)
      values.push('%' + req.query.user_id + '%')
      idx += 2
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

    const countQuery = `
      SELECT COUNT(*) FROM audit_log al
      JOIN users u ON u.id = al.user_id
      ${where}
    `

    const dataQuery = `
      SELECT
        al.id,
        al.user_id,
        u.full_name AS user_full_name,
        al.action,
        al.target_type,
        al.target_id,
        al.details,
        al.created_at
      FROM audit_log al
      JOIN users u ON u.id = al.user_id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `

    const countValues = [...values]
    const dataValues  = [...values, limit, offset]

    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, countValues),
      pool.query(dataQuery,  dataValues),
    ])

    const total      = parseInt(countResult.rows[0].count)
    const totalPages = Math.ceil(total / limit)

    res.json({ data: dataResult.rows, total, page, totalPages })
  } catch (err) {
    next(err)
  }
})

export default router
