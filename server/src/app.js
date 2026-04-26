import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import authRoutes from './routes/auth.routes.js'
import userRoutes from './routes/users.routes.js'
import categoryRoutes from './routes/categories.routes.js'
import departmentRoutes from './routes/departments.routes.js'
import documentRoutes from './routes/documents.routes.js'
import attachmentRoutes from './routes/attachments.routes.js'
import routingRoutes from './routes/routing.routes.js'
import actionRoutes from './routes/actions.routes.js'
import eventsRoutes from './routes/events.routes.js'
import notificationRoutes from './routes/notifications.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import dashboardRoutes from './routes/dashboard.routes.js'
import reportsRoutes from './routes/reports.routes.js'
import commentsRoutes from './routes/comments.routes.js'
import auditLogRoutes from './routes/audit-log.routes.js'
import templatesRoutes from './routes/templates.routes.js'
import recallRoutes from './routes/recall.routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// In production the frontend is served from the same origin — no CORS needed.
// In development allow the Vite dev server.
if (!isProd) {
  app.use(cors({
    origin: process.env.CORS_ORIGIN || process.env.APP_URL || 'http://localhost:5173',
    credentials: true,
  }))
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/departments', departmentRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/documents', attachmentRoutes)
app.use('/api/documents', routingRoutes)
app.use('/api/documents', actionRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/documents', commentsRoutes)
app.use('/api/audit-log', auditLogRoutes)
app.use('/api/templates', templatesRoutes)
app.use('/api/documents', recallRoutes)

// ── Serve built React frontend in production ──────────────────────────────────
const clientDist = path.join(__dirname, '../../client/dist')
if (isProd && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  // All non-API routes → index.html (React Router handles them)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } })
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// Global error handler
app.use((err, _req, res, _next) => {
  const status = err.status || 500
  const code = err.code || 'INTERNAL_ERROR'
  const message = err.message || 'An unexpected error occurred'
  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${code}: ${message}`, err.stack)
  }
  res.status(status).json({
    error: { code, message: status >= 500 ? 'An unexpected error occurred' : message },
  })
})

export default app
