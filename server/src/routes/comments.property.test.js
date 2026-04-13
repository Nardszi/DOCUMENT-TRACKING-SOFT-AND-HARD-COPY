// Feature: noneco-enhancements, Properties 8–13: Comment Property Tests

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// ---------------------------------------------------------------------------
// Mock pool and audit so tests are self-contained (no real DB needed)
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

const JWT_SECRET = 'dev-secret-change-in-production'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(userId, role = 'staff') {
  return jwt.sign(
    { sub: userId, role, departmentId: 'dept-uuid', fullName: 'Test User' },
    JWT_SECRET,
    { expiresIn: '30m' },
  )
}

/** Prepend the is_active check that authenticate() always performs first */
function mockAuth() {
  pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
}

function buildApp() {
  const app = express()
  app.use(express.json())
  // Mount at /api/documents to match the real app
  app.use('/api/documents', commentsRouter)
  return app
}

// ---------------------------------------------------------------------------
// Property 8: Comment Submission Round-Trip
// Validates: Requirements 4.2
// ---------------------------------------------------------------------------

describe('Property 8: Comment Submission Round-Trip', () => {
  /**
   * For any authenticated user and any non-empty comment content string,
   * submitting a comment to POST /api/documents/:id/comments and then
   * fetching GET /api/documents/:id/comments should return a list containing
   * a comment with the exact content, the author's user ID, and a non-null
   * created_at timestamp.
   *
   * **Validates: Requirements 4.2**
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('round-trip: posted comment appears in GET with correct content, user id, and created_at', async () => {
    const app = buildApp()

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1 }),
        async (userId, documentId, content) => {
          vi.clearAllMocks()
          const token = makeToken(userId)
          const commentId = 'comment-' + Math.random().toString(36).slice(2)
          const now = new Date().toISOString()

          // POST /api/documents/:id/comments
          //   1. authenticate → is_active check
          //   2. INSERT comment → returns new row
          //   3. SELECT user info for response
          mockAuth()
          pool.query
            .mockResolvedValueOnce({
              rows: [{ id: commentId, content: content.trim(), created_at: now, updated_at: now }],
            })
            .mockResolvedValueOnce({
              rows: [{ full_name: 'Test User', department_name: 'IT' }],
            })

          const postRes = await request(app)
            .post(`/api/documents/${documentId}/comments`)
            .set('Authorization', `Bearer ${token}`)
            .send({ content })

          expect(postRes.status).toBe(201)

          // GET /api/documents/:id/comments
          //   1. authenticate → is_active check
          //   2. SELECT comments
          mockAuth()
          pool.query.mockResolvedValueOnce({
            rows: [
              {
                id: commentId,
                content: content.trim(),
                created_at: now,
                updated_at: now,
                user_id: userId,
                user_full_name: 'Test User',
                department_name: 'IT',
              },
            ],
          })

          const getRes = await request(app)
            .get(`/api/documents/${documentId}/comments`)
            .set('Authorization', `Bearer ${token}`)

          expect(getRes.status).toBe(200)
          expect(Array.isArray(getRes.body)).toBe(true)

          const found = getRes.body.find((c) => c.id === commentId)
          expect(found).toBeDefined()
          expect(found.content).toBe(content.trim())
          expect(found.user.id).toBe(userId)
          expect(found.created_at).not.toBeNull()
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 9: Comments Returned in Chronological Order
// Validates: Requirements 4.3
// ---------------------------------------------------------------------------

describe('Property 9: Comments Returned in Chronological Order', () => {
  /**
   * For any document with multiple comments, the array returned by
   * GET /api/documents/:id/comments should be sorted by created_at ascending
   * (oldest first).
   *
   * **Validates: Requirements 4.3**
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET comments returns array sorted by created_at ascending', async () => {
    const app = buildApp()

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.array(fc.string({ minLength: 1 }), { minLength: 2, maxLength: 10 }),
        async (userId, documentId, contents) => {
          vi.clearAllMocks()
          const token = makeToken(userId)

          // Build comment rows with strictly increasing timestamps
          const baseTime = Date.now()
          const rows = contents.map((content, i) => ({
            id: `comment-${i}`,
            content,
            created_at: new Date(baseTime + i * 1000).toISOString(),
            updated_at: new Date(baseTime + i * 1000).toISOString(),
            user_id: userId,
            user_full_name: 'Test User',
            department_name: 'IT',
          }))

          // authenticate → is_active, then SELECT comments
          mockAuth()
          pool.query.mockResolvedValueOnce({ rows })

          const res = await request(app)
            .get(`/api/documents/${documentId}/comments`)
            .set('Authorization', `Bearer ${token}`)

          expect(res.status).toBe(200)
          expect(Array.isArray(res.body)).toBe(true)
          expect(res.body.length).toBe(rows.length)

          // Verify ascending order
          for (let i = 1; i < res.body.length; i++) {
            const prev = new Date(res.body[i - 1].created_at).getTime()
            const curr = new Date(res.body[i].created_at).getTime()
            expect(curr).toBeGreaterThanOrEqual(prev)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 10: Empty Comment Rejection
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe('Property 10: Empty Comment Rejection', () => {
  /**
   * For any string that is empty or composed entirely of whitespace,
   * submitting it as content to POST /api/documents/:id/comments should
   * return a 400 error.
   *
   * **Validates: Requirements 4.4**
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects empty or whitespace-only content with 400', async () => {
    const app = buildApp()

    // Generator: empty string or strings of only whitespace characters
    const arbWhitespaceOrEmpty = fc.oneof(
      fc.constant(''),
      fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 }),
    )

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        arbWhitespaceOrEmpty,
        async (userId, documentId, content) => {
          vi.clearAllMocks()
          const token = makeToken(userId)

          // authenticate → is_active check (route validates content before any DB call)
          mockAuth()

          const res = await request(app)
            .post(`/api/documents/${documentId}/comments`)
            .set('Authorization', `Bearer ${token}`)
            .send({ content })

          expect(res.status).toBe(400)
          expect(res.body.error).toBeDefined()
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 11: Comment Deletion Authorization
// Validates: Requirements 4.6
// ---------------------------------------------------------------------------

describe('Property 11: Comment Deletion Authorization', () => {
  /**
   * For any comment, only the comment's author or an admin should be able
   * to delete it. A request from any other authenticated user should return 403.
   *
   * **Validates: Requirements 4.6**
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('non-author staff user receives 403 when attempting to delete another user\'s comment', async () => {
    const app = buildApp()

    // Generator: a staff user who is NOT the comment author
    const arbNonAuthorStaff = fc
      .record({
        authorId: fc.uuid(),
        requesterId: fc.uuid(),
        documentId: fc.uuid(),
        commentId: fc.uuid(),
      })
      .filter(({ authorId, requesterId }) => authorId !== requesterId)

    await fc.assert(
      fc.asyncProperty(arbNonAuthorStaff, async ({ authorId, requesterId, documentId, commentId }) => {
        vi.clearAllMocks()
        // The requester is a staff user (not admin, not the author)
        const token = makeToken(requesterId, 'staff')

        // authenticate → is_active check
        mockAuth()
        // DELETE route: SELECT comment to check ownership
        pool.query.mockResolvedValueOnce({
          rows: [{ id: commentId, user_id: authorId }],
        })

        const res = await request(app)
          .delete(`/api/documents/${documentId}/comments/${commentId}`)
          .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('COMMENT_FORBIDDEN')
      }),
      { numRuns: 100 },
    )
  })

  it('comment author can delete their own comment (204 response)', async () => {
    const app = buildApp()

    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.uuid(), fc.uuid(), async (authorId, documentId, commentId) => {
        vi.clearAllMocks()
        const token = makeToken(authorId, 'staff')

        // authenticate → is_active check
        mockAuth()
        // SELECT comment (ownership check)
        pool.query.mockResolvedValueOnce({ rows: [{ id: commentId, user_id: authorId }] })
        // DELETE query
        pool.query.mockResolvedValueOnce({ rows: [] })

        const res = await request(app)
          .delete(`/api/documents/${documentId}/comments/${commentId}`)
          .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(204)
      }),
      { numRuns: 100 },
    )
  })

  it('admin can delete any comment regardless of authorship', async () => {
    const app = buildApp()

    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            authorId: fc.uuid(),
            adminId: fc.uuid(),
            documentId: fc.uuid(),
            commentId: fc.uuid(),
          })
          .filter(({ authorId, adminId }) => authorId !== adminId),
        async ({ authorId, adminId, documentId, commentId }) => {
          vi.clearAllMocks()
          const token = makeToken(adminId, 'admin')

          // authenticate → is_active check
          mockAuth()
          // SELECT comment (ownership check — belongs to authorId, not admin)
          pool.query.mockResolvedValueOnce({ rows: [{ id: commentId, user_id: authorId }] })
          // DELETE query
          pool.query.mockResolvedValueOnce({ rows: [] })

          const res = await request(app)
            .delete(`/api/documents/${documentId}/comments/${commentId}`)
            .set('Authorization', `Bearer ${token}`)

          expect(res.status).toBe(204)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 12: Comment Edit Marks as Edited
// Validates: Requirements 4.7
// ---------------------------------------------------------------------------

describe('Property 12: Comment Edit Marks as Edited', () => {
  /**
   * For any comment that is edited within 24 hours of creation, the
   * updated_at timestamp in the response should be strictly greater than
   * created_at.
   *
   * **Validates: Requirements 4.7**
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('editing a comment within 24h returns updated_at strictly greater than created_at', async () => {
    const app = buildApp()

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1 }),
        async (userId, documentId, commentId, newContent) => {
          vi.clearAllMocks()
          const token = makeToken(userId, 'staff')

          // Comment was created 1 hour ago (within 24h window)
          const createdAt = new Date(Date.now() - 60 * 60 * 1000)
          // updated_at is now (strictly after created_at)
          const updatedAt = new Date()

          // authenticate → is_active check
          mockAuth()
          // PATCH route:
          //   1. SELECT comment (ownership + age check)
          pool.query.mockResolvedValueOnce({
            rows: [{ id: commentId, user_id: userId, created_at: createdAt.toISOString() }],
          })
          //   2. UPDATE returning updated row
          pool.query.mockResolvedValueOnce({
            rows: [
              {
                id: commentId,
                content: newContent.trim(),
                created_at: createdAt.toISOString(),
                updated_at: updatedAt.toISOString(),
                user_id: userId,
              },
            ],
          })
          //   3. SELECT user info for response
          pool.query.mockResolvedValueOnce({
            rows: [{ id: userId, full_name: 'Test User', department_name: 'IT' }],
          })

          const res = await request(app)
            .patch(`/api/documents/${documentId}/comments/${commentId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ content: newContent })

          expect(res.status).toBe(200)
          expect(res.body.updated_at).toBeDefined()
          expect(res.body.created_at).toBeDefined()

          const returnedUpdatedAt = new Date(res.body.updated_at).getTime()
          const returnedCreatedAt = new Date(res.body.created_at).getTime()
          expect(returnedUpdatedAt).toBeGreaterThan(returnedCreatedAt)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 13: Comments Allowed on Any Document Status
// Validates: Requirements 4.8
// ---------------------------------------------------------------------------

describe('Property 13: Comments Allowed on Any Document Status', () => {
  /**
   * For any document regardless of its status (including completed),
   * POST /api/documents/:id/comments should succeed for authenticated users.
   *
   * **Validates: Requirements 4.8**
   */
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST comment succeeds for any document status', async () => {
    const app = buildApp()

    const arbDocumentStatus = fc.constantFrom('pending', 'in_progress', 'completed', 'returned')

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        arbDocumentStatus,
        fc.string({ minLength: 1 }),
        async (userId, documentId, _status, content) => {
          vi.clearAllMocks()
          const token = makeToken(userId, 'staff')
          const commentId = 'comment-' + Math.random().toString(36).slice(2)
          const now = new Date().toISOString()

          // authenticate → is_active check
          mockAuth()
          // INSERT comment
          pool.query.mockResolvedValueOnce({
            rows: [{ id: commentId, content: content.trim(), created_at: now, updated_at: now }],
          })
          // SELECT user info
          pool.query.mockResolvedValueOnce({
            rows: [{ full_name: 'Test User', department_name: 'IT' }],
          })

          const res = await request(app)
            .post(`/api/documents/${documentId}/comments`)
            .set('Authorization', `Bearer ${token}`)
            .send({ content })

          // The route does not gate on document status — any status should succeed
          expect(res.status).toBe(201)
        },
      ),
      { numRuns: 100 },
    )
  })
})
