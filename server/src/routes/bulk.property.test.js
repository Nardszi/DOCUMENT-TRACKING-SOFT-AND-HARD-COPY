// Feature: noneco-enhancements, Property 19: Bulk Action Applies to All Eligible Documents and Records Tracking Log
// Feature: noneco-enhancements, Property 20: Bulk Action Skips Ineligible Documents
// Feature: noneco-enhancements, Property 21: Bulk Actions Restricted to Head or Admin

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// ---------------------------------------------------------------------------
// Mock the DB pool so tests are self-contained (no real DB needed)
// ---------------------------------------------------------------------------
vi.mock('../db/pool.js', () => {
  const query = vi.fn()
  const connect = vi.fn()
  return { default: { query, connect } }
})

// Mock audit utility to avoid side effects
vi.mock('../utils/audit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}))

// Mock QR service (used by documents router)
vi.mock('../services/qr.service.js', () => ({
  generateQRCode: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}))

// Mock tracking number utility
vi.mock('../utils/trackingNumber.js', () => ({
  generateTrackingNumber: vi.fn().mockResolvedValue('NONECO-20250101-00001'),
}))

import pool from '../db/pool.js'
import documentsRouter from './documents.routes.js'

const JWT_SECRET = 'dev-secret-change-in-production'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/documents', documentsRouter)
  // Global error handler
  app.use((err, _req, res, _next) => {
    const status = err.status || 500
    const code = err.code || 'INTERNAL_ERROR'
    const message = err.message || 'An unexpected error occurred'
    res.status(status).json({ error: { code, message } })
  })
  return app
}

function makeToken(role = 'department_head', userId = 'user-uuid-0001', departmentId = 'dept-uuid-0001') {
  return jwt.sign(
    { sub: userId, role, departmentId, fullName: 'Test User' },
    JWT_SECRET,
    { expiresIn: '30m' },
  )
}

/**
 * Build a mock pool client for bulk-complete (which uses pool.connect() + client.query()).
 * The clientQueryFn receives the SQL and params and returns a result object.
 */
function makeMockClient(clientQueryFn) {
  const client = {
    query: vi.fn().mockImplementation(clientQueryFn),
    release: vi.fn(),
  }
  return client
}

// ---------------------------------------------------------------------------
// Property 19: Bulk Action Applies to All Eligible Documents and Records Tracking Log
// ---------------------------------------------------------------------------

/**
 * Property 19: Bulk Action Applies to All Eligible Documents and Records Tracking Log
 *
 * For any set of document IDs submitted to POST /api/documents/bulk-complete,
 * each document that was not already completed should have its status set to
 * completed and a new tracking log entry of type 'completed' should exist for it.
 *
 * Validates: Requirements 6.3, 6.5
 */
describe('Property 19: Bulk Action Applies to All Eligible Documents and Records Tracking Log', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildTestApp()

    // authenticate middleware uses pool.query for is_active check
    pool.query.mockResolvedValue({ rows: [{ is_active: true }] })
  })

  it('completed count equals input size and skipped is 0 when all docs are non-completed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1–20 unique UUIDs as document IDs
        fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
        async (documentIds) => {
          pool.query.mockReset()
          // authenticate middleware: is_active check
          pool.query.mockResolvedValue({ rows: [{ is_active: true }] })

          // Track all client.query calls for assertions
          const clientCalls = []

          const client = makeMockClient((sql, params) => {
            clientCalls.push({ sql, params })
            const sqlStr = typeof sql === 'string' ? sql : ''

            if (sqlStr.includes('BEGIN') || sqlStr.includes('COMMIT') || sqlStr.includes('ROLLBACK')) {
              return Promise.resolve({ rows: [] })
            }
            // SELECT id, status FROM documents WHERE id = $1
            if (sqlStr.includes('SELECT id, status FROM documents')) {
              const docId = params[0]
              return Promise.resolve({ rows: [{ id: docId, status: 'pending' }] })
            }
            // UPDATE documents SET status = 'completed'
            if (sqlStr.includes('UPDATE documents SET status')) {
              return Promise.resolve({ rows: [], rowCount: 1 })
            }
            // INSERT INTO tracking_log
            if (sqlStr.includes('INSERT INTO tracking_log')) {
              return Promise.resolve({ rows: [] })
            }
            return Promise.resolve({ rows: [] })
          })

          pool.connect.mockResolvedValue(client)

          const token = makeToken('department_head')
          const res = await request(app)
            .post('/api/documents/bulk-complete')
            .set('Authorization', `Bearer ${token}`)
            .send({ document_ids: documentIds })

          expect(res.status).toBe(200)
          expect(res.body.completed).toBe(documentIds.length)
          expect(res.body.skipped).toBe(0)

          // Verify UPDATE was called once per document
          const updateCalls = clientCalls.filter(
            (c) => typeof c.sql === 'string' && c.sql.includes('UPDATE documents SET status'),
          )
          expect(updateCalls).toHaveLength(documentIds.length)

          // Verify INSERT into tracking_log was called once per document
          const insertCalls = clientCalls.filter(
            (c) => typeof c.sql === 'string' && c.sql.includes('INSERT INTO tracking_log'),
          )
          expect(insertCalls).toHaveLength(documentIds.length)

          // Verify each INSERT used event_type 'completed'
          for (const call of insertCalls) {
            expect(call.sql).toContain("'completed'")
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 20: Bulk Action Skips Ineligible Documents
// ---------------------------------------------------------------------------

/**
 * Property 20: Bulk Action Skips Ineligible Documents
 *
 * For any set of document IDs where some are already completed, POST
 * /api/documents/bulk-complete should skip those documents and the response
 * skipped count should equal the number of already-completed documents in
 * the input set.
 *
 * Validates: Requirements 6.6
 */
describe('Property 20: Bulk Action Skips Ineligible Documents', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildTestApp()
    pool.query.mockResolvedValue({ rows: [{ is_active: true }] })
  })

  it('skipped count equals the number of already-completed docs in the input', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1–10 already-completed doc IDs
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }).map((ids) => [...new Set(ids)]).filter((ids) => ids.length >= 1),
        // Generate 0–10 non-completed doc IDs (distinct from completed ones)
        fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
        async (completedIds, pendingIds) => {
          // Ensure no overlap between completed and pending IDs
          const uniquePendingIds = pendingIds.filter((id) => !completedIds.includes(id))
          const allIds = [...completedIds, ...uniquePendingIds]

          // Need at least one document total
          if (allIds.length === 0) return

          pool.query.mockReset()
          pool.query.mockResolvedValue({ rows: [{ is_active: true }] })

          const completedSet = new Set(completedIds)

          const client = makeMockClient((sql, params) => {
            const sqlStr = typeof sql === 'string' ? sql : ''

            if (sqlStr.includes('BEGIN') || sqlStr.includes('COMMIT') || sqlStr.includes('ROLLBACK')) {
              return Promise.resolve({ rows: [] })
            }
            if (sqlStr.includes('SELECT id, status FROM documents')) {
              const docId = params[0]
              if (completedSet.has(docId)) {
                return Promise.resolve({ rows: [{ id: docId, status: 'completed' }] })
              }
              return Promise.resolve({ rows: [{ id: docId, status: 'pending' }] })
            }
            if (sqlStr.includes('UPDATE documents SET status') || sqlStr.includes('INSERT INTO tracking_log')) {
              return Promise.resolve({ rows: [], rowCount: 1 })
            }
            return Promise.resolve({ rows: [] })
          })

          pool.connect.mockResolvedValue(client)

          const token = makeToken('department_head')
          const res = await request(app)
            .post('/api/documents/bulk-complete')
            .set('Authorization', `Bearer ${token}`)
            .send({ document_ids: allIds })

          expect(res.status).toBe(200)
          expect(res.body.skipped).toBe(completedIds.length)
          expect(res.body.completed).toBe(uniquePendingIds.length)
          expect(res.body.completed + res.body.skipped).toBe(allIds.length)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 21: Bulk Actions Restricted to Head or Admin
// ---------------------------------------------------------------------------

/**
 * Property 21: Bulk Actions Restricted to Head or Admin
 *
 * For any authenticated user with role 'staff', both POST
 * /api/documents/bulk-complete and POST /api/documents/bulk-set-priority
 * should return 403 Forbidden.
 *
 * Validates: Requirements 6.7, 6.8
 */
describe('Property 21: Bulk Actions Restricted to Head or Admin', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildTestApp()
    pool.query.mockResolvedValue({ rows: [{ is_active: true }] })
  })

  it('returns 403 for staff role on POST /api/documents/bulk-complete', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant('staff'),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        async (role, documentIds) => {
          pool.query.mockReset()
          pool.query.mockResolvedValue({ rows: [{ is_active: true }] })

          const token = makeToken(role)
          const res = await request(app)
            .post('/api/documents/bulk-complete')
            .set('Authorization', `Bearer ${token}`)
            .send({ document_ids: documentIds })

          expect(res.status).toBe(403)
          expect(res.body.error.code).toBe('FORBIDDEN')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns 403 for staff role on POST /api/documents/bulk-set-priority', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant('staff'),
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        fc.constantFrom('low', 'normal', 'high', 'urgent'),
        async (role, documentIds, priority) => {
          pool.query.mockReset()
          pool.query.mockResolvedValue({ rows: [{ is_active: true }] })

          const token = makeToken(role)
          const res = await request(app)
            .post('/api/documents/bulk-set-priority')
            .set('Authorization', `Bearer ${token}`)
            .send({ document_ids: documentIds, priority })

          expect(res.status).toBe(403)
          expect(res.body.error.code).toBe('FORBIDDEN')
        },
      ),
      { numRuns: 100 },
    )
  })
})
