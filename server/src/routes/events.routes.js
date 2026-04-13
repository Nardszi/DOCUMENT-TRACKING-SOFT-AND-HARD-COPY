import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { sseManager } from '../sse/sseManager.js'

const router = Router()

// Middleware that accepts token from query param for SSE (browsers can't set headers on EventSource)
function authenticateSSE(req, res, next) {
  if (req.query.token && !req.headers['authorization']) {
    req.headers['authorization'] = `Bearer ${req.query.token}`
  }
  return authenticate(req, res, next)
}

// GET /api/events — SSE stream for authenticated users
router.get('/', authenticateSSE, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disable nginx buffering
  res.flushHeaders()

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

  // Register connection
  sseManager.connect(req.user.id, res)
})

export default router
