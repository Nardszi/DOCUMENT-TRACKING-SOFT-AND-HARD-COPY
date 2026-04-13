/**
 * Integration test: Bulk-complete with mixed document statuses
 *
 * Validates: Requirements 6.5, 6.6
 *
 * Tests:
 *  1. Mixed statuses (3 non-completed + 2 already-completed) → completed=3, skipped=2
 *  2. All documents already completed → completed=0, skipped=5
 *  3. All documents non-completed → completed=5, skipped=0
 *  4. Empty document_ids → 400 error
 *  5. More than 100 document_ids → 400 error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// ---------------------------------------------------------------------------
// Mock pool.js and audit.js so no real DB is needed
// ---------------------------------------------------------------------------
vi.mock('../db/pool.js', () => {
  const query = vi.fn()
  const connect = vi.fn()
  return { default: { query, connect } }
})

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const JWT_SECRET = 'dev-secret-change-in-production'

const DOC_IDS = {
  pending1: 'doc-pend-0001-0000-0000-000000000001',
  pending2: 'doc-pend-0002-0000-0000-000000000002',
  pending3: 'doc-pend-0003-0000-0000-000000000003',
  completed1: 'doc-comp-0001-0000-0000-000000000004',
  completed2: 'doc-comp-0002-0000-0000-000000000005',
}

const COMPLETED_SET = new Set([DOC_IDS.completed1, DOC_IDS.completed2])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/documents', documentsRouter)
  app.use((err, _req, res, _next) => {
    const status = err.status || 500
    res.status(status).json({ error: { code: err.code || 'INTERNAL_ERROR', message: err.message } })
  })
  return app
}

function makeToken(role = 'department_head') {
  return jwt.sign(
    { sub: 'user-uuid-0001', role, departmentId: 'dept-uuid-0001', fullName: 'Test User' },
    JWT_SECRET,
    { expiresIn: '30m' },
  )
}

/**
 * Build a mock pool client whose query() returns results based on the SQL.
 * completedIds: Set of doc IDs that should be treated as already completed.
 */
function makeMockClient(completedIds = new Set()) {
  const calls = { update: 0, insert: 0 }
  const client = {
    _calls: calls,
    query: vi.fn().mockImplementation((sql, params) => {
      const s = typeof sql === 'string' ? sql : ''

      if (s.includes('BEGIN') || s.includes('COMMIT') || s.includes('ROLLBACK')) {
        return Promise.resolve({ rows: [] })
      }
      if (s.includes('SELECT id, status FROM documents')) {
        const docId = params[0]
        const status = completedIds.has(docId) ? 'completed' : 'pending'
        return Promise.resolve({ rows: [{ id: docId, status }] })
      }
      if (s.includes('UPDATE documents SET status')) {
        calls.update++
        return Promise.resolve({ rows: [], rowCount: 1 })
      }
      if (s.includes('INSERT INTO tracking_log')) {
        calls.insert++
        return Promise.resolve({ rows: [] })
      }
      return Promise.resolve({ rows: [] })
    }),
    release: vi.fn(),
  }
  return client
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Bulk-complete integration: mixed document statuses', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildApp()
    // authenticate middleware: is_active check
    pool.query.mockResolvedValue({ rows: [{ is_active: true }] })
  })

  // -------------------------------------------------------------------------
  // Test 1: Mixed statuses — 3 non-completed + 2 already-completed
  // -------------------------------------------------------------------------
  it('mixed statuses: completed=3, skipped=2 when 3 pending + 2 already-completed', async () => {
    const allIds = [
      DOC_IDS.pending1,
      DOC_IDS.pending2,
      DOC_IDS.pending3,
      DOC_IDS.completed1,
      DOC_IDS.completed2,
    ]

    const client = makeMockClient(COMPLETED_SET)
    pool.connect.mockResolvedValue(client)

    const res = await request(app)
      .post('/api/documents/bulk-complete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ document_ids: allIds })

    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(3)
    expect(res.body.skipped).toBe(2)

    // UPDATE called only for the 3 non-completed docs
    expect(client._calls.update).toBe(3)

    // INSERT INTO tracking_log called only for the 3 non-completed docs
    expect(client._calls.insert).toBe(3)
  })

  // -------------------------------------------------------------------------
  // Test 2: All documents already completed → completed=0, skipped=5
  // -------------------------------------------------------------------------
  it('all already-completed: completed=0, skipped=5', async () => {
    const allIds = [
      DOC_IDS.pending1,
      DOC_IDS.pending2,
      DOC_IDS.pending3,
      DOC_IDS.completed1,
      DOC_IDS.completed2,
    ]
    // Treat all 5 as completed
    const allCompleted = new Set(allIds)

    const client = makeMockClient(allCompleted)
    pool.connect.mockResolvedValue(client)

    const res = await request(app)
      .post('/api/documents/bulk-complete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ document_ids: allIds })

    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(0)
    expect(res.body.skipped).toBe(5)

    // No UPDATE or INSERT should have been called
    expect(client._calls.update).toBe(0)
    expect(client._calls.insert).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Test 3: All documents non-completed → completed=5, skipped=0
  // -------------------------------------------------------------------------
  it('all non-completed: completed=5, skipped=0', async () => {
    const allIds = [
      DOC_IDS.pending1,
      DOC_IDS.pending2,
      DOC_IDS.pending3,
      DOC_IDS.completed1,
      DOC_IDS.completed2,
    ]
    // None are completed
    const client = makeMockClient(new Set())
    pool.connect.mockResolvedValue(client)

    const res = await request(app)
      .post('/api/documents/bulk-complete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ document_ids: allIds })

    expect(res.status).toBe(200)
    expect(res.body.completed).toBe(5)
    expect(res.body.skipped).toBe(0)

    // UPDATE and INSERT called for all 5 docs
    expect(client._calls.update).toBe(5)
    expect(client._calls.insert).toBe(5)
  })

  // -------------------------------------------------------------------------
  // Test 4: Empty document_ids → 400 error
  // -------------------------------------------------------------------------
  it('empty document_ids returns 400 with BULK_EMPTY code', async () => {
    const res = await request(app)
      .post('/api/documents/bulk-complete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ document_ids: [] })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BULK_EMPTY')
  })

  // -------------------------------------------------------------------------
  // Test 5: More than 100 document_ids → 400 error
  // -------------------------------------------------------------------------
  it('more than 100 document_ids returns 400 with BULK_LIMIT_EXCEEDED code', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `doc-${String(i).padStart(4, '0')}-uuid`)

    const res = await request(app)
      .post('/api/documents/bulk-complete')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ document_ids: ids })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BULK_LIMIT_EXCEEDED')
  })
})
