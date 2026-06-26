import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
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
import profileRoutes from './routes/profile.routes.js'
import approvalRoutes from './routes/approvals.routes.js'
import { migrate } from './db/migrate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const isVercel = process.env.VERCEL === '1'

const app = express()

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'blob:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// ── Request logging ───────────────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev', {
  skip: (req) => req.path === '/api/health',
}))

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// ── CSRF-like protection: verify Origin on state-changing requests ────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)
if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes('*')) {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000')
  ALLOWED_ORIGINS.push(/\.vercel\.app$/)
}

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer
    if (origin) {
      const allowed = ALLOWED_ORIGINS.some(a =>
        typeof a === 'string' ? origin.includes(a) : a.test(origin)
      )
      if (!allowed && !req.path.startsWith('/api/auth/register')) {
        return res.status(403).json({ error: { code: 'CSRF_REJECTED', message: 'Request origin not allowed.' } })
      }
    }
  }
  next()
})

// ── JWT secret warning ────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-in-production') {
  console.warn('\x1b[33m⚠️  WARNING: JWT_SECRET is not set or is using the default dev secret.\x1b[0m')
  console.warn('\x1b[33m   Set JWT_SECRET in production to a long random string.\x1b[0m')
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Strict: login/register/reset — 5 attempts per 15 min
const authStrictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many authentication attempts. Please try again in 15 minutes.' } },
})

// Moderate: general auth routes — 50 per 15 min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later.' } },
})

// Global: all API routes — 300 requests per 15 min per IP (skipped for localhost)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please slow down.' } },
})

// ── Run pending migrations on startup ─────────────────────────────────────────
if (process.env.AUTO_MIGRATE !== 'false') {
  migrate().catch(err => console.error('[migrate] migration failed:', err.message))
}

// CORS: allow Vite dev server + Vercel production frontend
// Set CORS_ORIGIN=* to allow any origin (without credentials)
const corsOrigin = process.env.CORS_ORIGIN
if (corsOrigin === '*') {
  app.use(cors({ origin: true, credentials: true }))
} else if (corsOrigin) {
  app.use(cors({
    origin: corsOrigin.split(',').map(s => s.trim()),
    credentials: true,
  }))
} else {
  app.use(cors({
    origin: ['http://localhost:5173', /\.vercel\.app$/],
    credentials: true,
  }))
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Global API rate limit
app.use('/api', globalLimiter)

// Auth: strict limits on login/register/reset, moderate on others
app.use('/api/auth/login', authStrictLimiter)
app.use('/api/auth/register', authStrictLimiter)
app.use('/api/auth/reset-password-request', authStrictLimiter)
app.use('/api/auth/reset-password', authStrictLimiter)
app.use('/api/auth', authLimiter, authRoutes)

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
app.use('/api/profile', profileRoutes)
app.use('/api/approvals', approvalRoutes)

// ── Serve built React frontend in production ──────────────────────────────────
// Vercel serves static assets via its edge/CDN, skip here
const clientDist = path.join(__dirname, '../../client/dist')
if (!isVercel && isProd && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  // Only serve index.html for non-API routes (React Router handles client-side routing)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
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
