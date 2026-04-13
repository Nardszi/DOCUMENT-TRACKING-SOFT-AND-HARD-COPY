import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

// GET / — list all departments (any authenticated user)
router.get('/', authenticate, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, code, name FROM departments ORDER BY name ASC'
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

export default router
