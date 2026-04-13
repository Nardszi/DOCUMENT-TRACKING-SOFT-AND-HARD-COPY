import jwt from 'jsonwebtoken'
import pool from '../db/pool.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

/**
 * Middleware: verify Bearer JWT, check user is_active, attach req.user.
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or malformed Authorization header.' },
    })
  }

  const token = authHeader.slice(7)
  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token has expired.' : 'Invalid token.'
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message } })
  }

  // Re-check is_active from DB on every request
  try {
    const { rows } = await pool.query('SELECT is_active FROM users WHERE id = $1', [payload.sub])
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({
        error: { code: 'ACCOUNT_DEACTIVATED', message: 'Account has been deactivated.' },
      })
    }
  } catch (err) {
    return next(err)
  }

  req.user = {
    id: payload.sub,
    role: payload.role,
    departmentId: payload.departmentId,
    fullName: payload.fullName,
  }
  next()
}
