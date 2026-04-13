/**
 * Integration test: Full comment lifecycle
 *
 * Validates: Requirements 4.2, 4.5, 4.6, 4.7
 *
 * Lifecycle steps:
 *  1. POST   /api/documents/:id/comments        — create a comment
 *  2. GET    /api/documents/:id/comments        — verify it appears in the list
 *  3. PATCH  /api/documents/:id/comments/:cid   — edit within 24h
 *  4. GET    /api/documents/:id/comments        — verify "edited" indicator (updated_at > created_at)
 *  5. DELETE /api/documents/:id/comments/:cid   — delete as admin
 *  6. GET    /api/documents/:id/comments        — verify the comment is gone
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
  return { default: { query } }
})

vi.mock('../utils/audit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}))

import pool from '../db/pool.js'
import commentsRouter from './comments.routes.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const JWT_SECRET = 'dev-secret-change-in-production'

const DOCUMENT_ID = 'doc-uuid-1111-2222-3333-444444444444'
const COMMENT_ID = 'cmt-uuid-aaaa-bbbb-cccc-dddddddddddd'
const USER_ID = 'usr-uuid-1111-2222-3333-444444444444'
const ADMIN_ID = 'adm-uuid-1111-2222-3333-444444444444'

const NOW = new Date('2025-01-15T10:00:00.000Z')
const LATER = new Date('2025-01-15T10:05:00.000Z') // 5 minutes later — within 24h

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function makeToken(userId, role = 'staff') {
  return jwt.sign(
    { sub: userId, role, departmentId: 'dept-uuid', fullName: 'Test User' },
    JWT_SECRET,
    { expiresIn: '1h' },
  )
}

// ---------------------------------------------------------------------------
// Build a minimal Express app mounting the real comments router
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/documents', commentsRouter)
  // Simple error handler
  app.use((err, _req, res, _next) => {
    const status = err.status || 500
    res.status(status).json({ error: { code: err.code || 'ERROR', message: err.message } })
  })
  return app
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Comment lifecycle integration', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildApp()
  })

  // -------------------------------------------------------------------------
  // Step 1 — POST: create a comment
  // -------------------------------------------------------------------------
  it('Step 1: POST creates a comment and returns 201 with comment data', async () => {
    const token = makeToken(USER_ID)

    // authenticate middleware queries users table to check is_active
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth check
      .mockResolvedValueOnce({
        rows: [
          {
            id: COMMENT_ID,
            content: 'Initial comment text',
            created_at: NOW,
            updated_at: NOW,
          },
        ],
      }) // INSERT comment
      .mockResolvedValueOnce({
        rows: [{ full_name: 'Test User', department_name: 'IT Department' }],
      }) // SELECT user info

    const res = await request(app)
      .post(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Initial comment text' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe(COMMENT_ID)
    expect(res.body.content).toBe('Initial comment text')
    expect(res.body.user.id).toBe(USER_ID)
    expect(res.body.user.full_name).toBe('Test User')
    expect(res.body.user.department).toBe('IT Department')
  })

  // -------------------------------------------------------------------------
  // Step 2 — GET: verify the comment appears in the list
  // -------------------------------------------------------------------------
  it('Step 2: GET returns the created comment in the list', async () => {
    const token = makeToken(USER_ID)

    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth check
      .mockResolvedValueOnce({
        rows: [
          {
            id: COMMENT_ID,
            content: 'Initial comment text',
            created_at: NOW,
            updated_at: NOW,
            user_id: USER_ID,
            user_full_name: 'Test User',
            department_name: 'IT Department',
          },
        ],
      }) // SELECT comments

    const res = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)

    const comment = res.body[0]
    expect(comment.id).toBe(COMMENT_ID)
    expect(comment.content).toBe('Initial comment text')
    expect(comment.user.id).toBe(USER_ID)
    expect(comment.user.full_name).toBe('Test User')
    expect(comment.user.department).toBe('IT Department')
  })

  // -------------------------------------------------------------------------
  // Step 3 — PATCH: edit the comment within 24h
  // -------------------------------------------------------------------------
  it('Step 3: PATCH edits the comment within 24h and returns updated comment', async () => {
    const token = makeToken(USER_ID)

    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth check
      .mockResolvedValueOnce({
        rows: [{ id: COMMENT_ID, user_id: USER_ID, created_at: NOW }],
      }) // SELECT comment for ownership + age check
      .mockResolvedValueOnce({
        rows: [
          {
            id: COMMENT_ID,
            content: 'Edited comment text',
            created_at: NOW,
            updated_at: LATER,
            user_id: USER_ID,
          },
        ],
      }) // UPDATE comment
      .mockResolvedValueOnce({
        rows: [{ id: USER_ID, full_name: 'Test User', department_name: 'IT Department' }],
      }) // SELECT user info

    const res = await request(app)
      .patch(`/api/documents/${DOCUMENT_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Edited comment text' })

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(COMMENT_ID)
    expect(res.body.content).toBe('Edited comment text')
    expect(res.body.user.id).toBe(USER_ID)
  })

  // -------------------------------------------------------------------------
  // Step 4 — GET: verify "edited" indicator (updated_at > created_at)
  // -------------------------------------------------------------------------
  it('Step 4: GET after edit shows updated_at strictly greater than created_at', async () => {
    const token = makeToken(USER_ID)

    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth check
      .mockResolvedValueOnce({
        rows: [
          {
            id: COMMENT_ID,
            content: 'Edited comment text',
            created_at: NOW,
            updated_at: LATER, // updated_at > created_at → "edited" indicator
            user_id: USER_ID,
            user_full_name: 'Test User',
            department_name: 'IT Department',
          },
        ],
      }) // SELECT comments

    const res = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)

    const comment = res.body[0]
    expect(comment.content).toBe('Edited comment text')

    // "edited" indicator: updated_at must be strictly after created_at
    const createdAt = new Date(comment.created_at).getTime()
    const updatedAt = new Date(comment.updated_at).getTime()
    expect(updatedAt).toBeGreaterThan(createdAt)
  })

  // -------------------------------------------------------------------------
  // Step 5 — DELETE: delete as admin
  // -------------------------------------------------------------------------
  it('Step 5: DELETE as admin removes the comment and returns 204', async () => {
    const adminToken = makeToken(ADMIN_ID, 'admin')

    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth check
      .mockResolvedValueOnce({
        rows: [{ id: COMMENT_ID, user_id: USER_ID }],
      }) // SELECT comment for ownership check
      .mockResolvedValueOnce({ rows: [] }) // DELETE comment

    const res = await request(app)
      .delete(`/api/documents/${DOCUMENT_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(204)
  })

  // -------------------------------------------------------------------------
  // Step 6 — GET: verify the comment is gone
  // -------------------------------------------------------------------------
  it('Step 6: GET after delete returns an empty list', async () => {
    const token = makeToken(USER_ID)

    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // auth check
      .mockResolvedValueOnce({ rows: [] }) // SELECT comments — empty after delete

    const res = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Full lifecycle in sequence (single test)
  // -------------------------------------------------------------------------
  it('Full lifecycle: create → list → edit → list (edited) → delete → list (empty)', async () => {
    const userToken = makeToken(USER_ID)
    const adminToken = makeToken(ADMIN_ID, 'admin')

    // --- Step 1: Create ---
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({
        rows: [{ id: COMMENT_ID, content: 'Hello world', created_at: NOW, updated_at: NOW }],
      })
      .mockResolvedValueOnce({
        rows: [{ full_name: 'Test User', department_name: 'IT Department' }],
      })

    const createRes = await request(app)
      .post(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ content: 'Hello world' })

    expect(createRes.status).toBe(201)
    expect(createRes.body.content).toBe('Hello world')

    // --- Step 2: List — comment appears ---
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: COMMENT_ID,
            content: 'Hello world',
            created_at: NOW,
            updated_at: NOW,
            user_id: USER_ID,
            user_full_name: 'Test User',
            department_name: 'IT Department',
          },
        ],
      })

    const listRes1 = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${userToken}`)

    expect(listRes1.status).toBe(200)
    expect(listRes1.body).toHaveLength(1)
    expect(listRes1.body[0].content).toBe('Hello world')

    // --- Step 3: Edit within 24h ---
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, user_id: USER_ID, created_at: NOW }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: COMMENT_ID,
            content: 'Hello world (edited)',
            created_at: NOW,
            updated_at: LATER,
            user_id: USER_ID,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: USER_ID, full_name: 'Test User', department_name: 'IT Department' }],
      })

    const editRes = await request(app)
      .patch(`/api/documents/${DOCUMENT_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ content: 'Hello world (edited)' })

    expect(editRes.status).toBe(200)
    expect(editRes.body.content).toBe('Hello world (edited)')

    // --- Step 4: List — edited indicator present ---
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: COMMENT_ID,
            content: 'Hello world (edited)',
            created_at: NOW,
            updated_at: LATER,
            user_id: USER_ID,
            user_full_name: 'Test User',
            department_name: 'IT Department',
          },
        ],
      })

    const listRes2 = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${userToken}`)

    expect(listRes2.status).toBe(200)
    const edited = listRes2.body[0]
    expect(new Date(edited.updated_at).getTime()).toBeGreaterThan(
      new Date(edited.created_at).getTime(),
    )

    // --- Step 5: Delete as admin ---
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, user_id: USER_ID }] })
      .mockResolvedValueOnce({ rows: [] })

    const deleteRes = await request(app)
      .delete(`/api/documents/${DOCUMENT_ID}/comments/${COMMENT_ID}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(deleteRes.status).toBe(204)

    // --- Step 6: List — empty ---
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [] })

    const listRes3 = await request(app)
      .get(`/api/documents/${DOCUMENT_ID}/comments`)
      .set('Authorization', `Bearer ${userToken}`)

    expect(listRes3.status).toBe(200)
    expect(listRes3.body).toHaveLength(0)
  })
})
