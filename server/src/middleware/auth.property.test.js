// Feature: noneco-document-tracking, Property 1: Authentication Required

/**
 * Property 1: Authentication Required
 *
 * For any API endpoint in the system (except /api/auth/login and
 * /api/auth/reset-password*), a request made without a valid JWT token
 * should receive a 401 Unauthorized response.
 *
 * Validates: Requirements 1.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { authenticate } from './auth.js'

// ---------------------------------------------------------------------------
// Mock the DB pool so tests are self-contained (no real DB needed)
// ---------------------------------------------------------------------------
vi.mock('../db/pool.js', () => {
  const query = vi.fn()
  return { default: { query } }
})

import pool from '../db/pool.js'

const JWT_SECRET = 'dev-secret-change-in-production'

// ---------------------------------------------------------------------------
// Build a minimal Express app that mirrors the real app's protected routes
// ---------------------------------------------------------------------------

/**
 * Protected endpoints sampled from the design's REST API table.
 * Excludes /api/auth/login and /api/auth/reset-password* (public).
 */
const PROTECTED_ROUTES = [
  { method: 'post', path: '/api/auth/logout' },
  { method: 'get', path: '/api/documents' },
  { method: 'post', path: '/api/documents' },
  { method: 'get', path: '/api/documents/some-id' },
  { method: 'patch', path: '/api/documents/some-id' },
  { method: 'get', path: '/api/documents/some-id/qr-cover' },
  { method: 'get', path: '/api/documents/by-tracking/NONECO-20250101-00001' },
  { method: 'post', path: '/api/documents/some-id/forward' },
  { method: 'post', path: '/api/documents/some-id/return' },
  { method: 'post', path: '/api/documents/some-id/actions' },
  { method: 'patch', path: '/api/documents/some-id/complete' },
  { method: 'post', path: '/api/documents/some-id/attachments' },
  { method: 'get', path: '/api/documents/some-id/attachments/att-id' },
  { method: 'get', path: '/api/notifications' },
  { method: 'patch', path: '/api/notifications/some-id/read' },
  { method: 'patch', path: '/api/notifications/read-all' },
  { method: 'get', path: '/api/events' },
  { method: 'post', path: '/api/reports/generate' },
  { method: 'get', path: '/api/reports/some-id/download' },
  { method: 'get', path: '/api/users' },
  { method: 'post', path: '/api/users' },
  { method: 'patch', path: '/api/users/some-id' },
  { method: 'patch', path: '/api/users/some-id/deactivate' },
  { method: 'get', path: '/api/categories' },
  { method: 'post', path: '/api/categories' },
  { method: 'patch', path: '/api/categories/some-id' },
  { method: 'patch', path: '/api/settings/email-notifications' },
]

/** Build a test app where every route is protected by the authenticate middleware */
function buildTestApp() {
  const app = express()
  app.use(express.json())

  for (const { method, path } of PROTECTED_ROUTES) {
    app[method](path, authenticate, (_req, res) => {
      res.status(200).json({ ok: true })
    })
  }

  return app
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary: pick a random protected route */
const arbRoute = fc.constantFrom(...PROTECTED_ROUTES)

/** Arbitrary: generate a malformed / invalid Authorization header value */
const arbMalformedAuthHeader = fc.oneof(
  // Random string that is not a valid JWT
  fc.string({ minLength: 1, maxLength: 200 }).filter((s) => !s.startsWith('Bearer ')),
  // "Bearer " prefix but with garbage payload
  fc.string({ minLength: 1, maxLength: 200 }).map((s) => `Bearer ${s}`),
  // Structurally valid JWT but signed with wrong secret
  fc.record({
    sub: fc.uuid(),
    role: fc.constantFrom('staff', 'department_head', 'admin'),
  }).map(({ sub, role }) => {
    const token = jwt.sign({ sub, role }, 'wrong-secret', { expiresIn: '1h' })
    return `Bearer ${token}`
  }),
  // Expired JWT (signed with correct secret but already expired)
  fc.record({
    sub: fc.uuid(),
    role: fc.constantFrom('staff', 'department_head', 'admin'),
  }).map(({ sub, role }) => {
    const token = jwt.sign({ sub, role }, JWT_SECRET, { expiresIn: -1 })
    return `Bearer ${token}`
  }),
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 1: Authentication Required', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildTestApp()
  })

  it('returns 401 for any protected endpoint when no Authorization header is provided', async () => {
    await fc.assert(
      fc.asyncProperty(arbRoute, async ({ method, path }) => {
        const res = await request(app)[method](path)
        expect(res.status).toBe(401)
        expect(res.body.error.code).toBe('UNAUTHORIZED')
      }),
      { numRuns: 500 },
    )
  })

  it('returns 401 for any protected endpoint when Authorization header is malformed or invalid', async () => {
    await fc.assert(
      fc.asyncProperty(arbRoute, arbMalformedAuthHeader, async ({ method, path }, authHeader) => {
        const res = await request(app)[method](path).set('Authorization', authHeader)
        expect(res.status).toBe(401)
      }),
      { numRuns: 500 },
    )
  })

  it('returns 401 with ACCOUNT_DEACTIVATED for any protected endpoint when user is deactivated', async () => {
    // Pool mock: user exists but is_active = false
    pool.query.mockResolvedValue({ rows: [{ is_active: false }] })

    await fc.assert(
      fc.asyncProperty(
        arbRoute,
        fc.record({
          sub: fc.uuid(),
          role: fc.constantFrom('staff', 'department_head', 'admin'),
          departmentId: fc.uuid(),
          fullName: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async ({ method, path }, payload) => {
          const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30m' })
          const res = await request(app)[method](path).set('Authorization', `Bearer ${token}`)
          expect(res.status).toBe(401)
          expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED')
        },
      ),
      { numRuns: 500 },
    )
  })

  it('allows access to protected endpoints when a valid JWT for an active user is provided', async () => {
    // Pool mock: user exists and is_active = true
    pool.query.mockResolvedValue({ rows: [{ is_active: true }] })

    const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const token = jwt.sign(
      { sub: userId, role: 'staff', departmentId: 'dept-uuid', fullName: 'Test User' },
      JWT_SECRET,
      { expiresIn: '30m' },
    )

    await fc.assert(
      fc.asyncProperty(arbRoute, async ({ method, path }) => {
        const res = await request(app)[method](path).set('Authorization', `Bearer ${token}`)
        // Should NOT be 401 — auth passed (may be 200 from our stub handler)
        expect(res.status).not.toBe(401)
      }),
      { numRuns: 500 },
    )
  })
})
