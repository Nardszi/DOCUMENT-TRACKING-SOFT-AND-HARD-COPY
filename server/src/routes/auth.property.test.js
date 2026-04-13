// Feature: noneco-enhancements, Property 1: Password Change Requires Valid Current Password

/**
 * Property 1: Password Change Requires Valid Current Password
 *
 * For any authenticated user and any string that does not match their stored
 * password hash, submitting that string as `current_password` to
 * POST /api/auth/change-password should return a 400 error with code
 * INVALID_PASSWORD.
 *
 * Validates: Requirements 1.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import express from 'express'
import request from 'supertest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

// ---------------------------------------------------------------------------
// Mock the DB pool so tests are self-contained (no real DB needed)
// ---------------------------------------------------------------------------
vi.mock('../db/pool.js', () => {
  const query = vi.fn()
  return { default: { query } }
})

// Mock audit utility to avoid side effects
vi.mock('../utils/audit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
}))

import pool from '../db/pool.js'
import authRouter from './auth.routes.js'

const JWT_SECRET = 'dev-secret-change-in-production'

// ---------------------------------------------------------------------------
// Known correct password and its bcrypt hash (computed once for the suite)
// ---------------------------------------------------------------------------
const CORRECT_PASSWORD = 'correct-password-123'
let CORRECT_PASSWORD_HASH

// ---------------------------------------------------------------------------
// Build a minimal Express app that mounts the real auth router
// ---------------------------------------------------------------------------
function buildTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  return app
}

/**
 * Generate a valid JWT for a test user whose DB row will be mocked.
 */
function makeToken(userId = 'test-user-uuid-0001') {
  return jwt.sign(
    { sub: userId, role: 'staff', departmentId: 'dept-uuid', fullName: 'Test User' },
    JWT_SECRET,
    { expiresIn: '30m' },
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 1: Password Change Requires Valid Current Password', () => {
  let app

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildTestApp()

    // Compute the hash once (reused across all test runs via the outer variable)
    if (!CORRECT_PASSWORD_HASH) {
      CORRECT_PASSWORD_HASH = await bcrypt.hash(CORRECT_PASSWORD, 10)
    }

    // Default pool mock behaviour:
    //   - First call (from authenticate middleware): returns is_active = true
    //   - Second call (from change-password handler): returns the user row with the known hash
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ password_hash: CORRECT_PASSWORD_HASH }] })
  })

  it(
    'returns 400 INVALID_PASSWORD for any string that is not the correct password',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary strings that are NOT the correct password
          fc.string({ minLength: 8 }).filter((s) => s !== CORRECT_PASSWORD),
          async (wrongPassword) => {
            // Reset mocks for each iteration
            pool.query.mockReset()
            pool.query
              .mockResolvedValueOnce({ rows: [{ is_active: true }] })
              .mockResolvedValueOnce({ rows: [{ password_hash: CORRECT_PASSWORD_HASH }] })

            const token = makeToken()
            const res = await request(app)
              .post('/api/auth/change-password')
              .set('Authorization', `Bearer ${token}`)
              .send({ current_password: wrongPassword, new_password: 'new-valid-password-xyz' })

            expect(res.status).toBe(400)
            expect(res.body.error.code).toBe('INVALID_PASSWORD')
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'returns 400 INVALID_PASSWORD for short strings (< 8 chars) that are not the correct password',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Short strings (< 8 chars) are also wrong passwords
          fc.string({ minLength: 1, maxLength: 7 }).filter((s) => s !== CORRECT_PASSWORD),
          async (wrongPassword) => {
            pool.query.mockReset()
            pool.query
              .mockResolvedValueOnce({ rows: [{ is_active: true }] })
              .mockResolvedValueOnce({ rows: [{ password_hash: CORRECT_PASSWORD_HASH }] })

            const token = makeToken()
            const res = await request(app)
              .post('/api/auth/change-password')
              .set('Authorization', `Bearer ${token}`)
              .send({ current_password: wrongPassword, new_password: 'new-valid-password-xyz' })

            // Either PASSWORD_TOO_SHORT (if new_password check runs first) or INVALID_PASSWORD
            // The route checks new_password length before verifying current_password,
            // but here new_password is valid (>= 8 chars), so we always reach the bcrypt check.
            expect(res.status).toBe(400)
            expect(res.body.error.code).toBe('INVALID_PASSWORD')
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'returns 200 when the correct password is supplied as current_password',
    async () => {
      // Sanity check: the correct password should succeed (not return INVALID_PASSWORD)
      pool.query.mockReset()
      pool.query
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })   // authenticate
        .mockResolvedValueOnce({ rows: [{ password_hash: CORRECT_PASSWORD_HASH }] }) // SELECT password_hash
        .mockResolvedValueOnce({ rows: [] })                       // UPDATE users SET password_hash

      const token = makeToken()
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ current_password: CORRECT_PASSWORD, new_password: 'new-valid-password-xyz' })

      expect(res.status).toBe(200)
      expect(res.body.message).toBe('Password changed successfully.')
    },
  )
})

// Feature: noneco-enhancements, Property 2: Password Minimum Length Enforcement

/**
 * Property 2: Password Minimum Length Enforcement
 *
 * For any string shorter than 8 characters submitted as `new_password` to
 * POST /api/auth/change-password, the endpoint should return a 400 error
 * with code PASSWORD_TOO_SHORT.
 *
 * Validates: Requirements 1.5
 */

describe('Property 2: Password Minimum Length Enforcement', () => {
  let app
  let CORRECT_PASSWORD_HASH_P2

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildTestApp()

    if (!CORRECT_PASSWORD_HASH_P2) {
      CORRECT_PASSWORD_HASH_P2 = await bcrypt.hash(CORRECT_PASSWORD, 10)
    }

    // Default mock: authenticate + change-password handler
    pool.query
      .mockResolvedValueOnce({ rows: [{ is_active: true }] })
      .mockResolvedValueOnce({ rows: [{ password_hash: CORRECT_PASSWORD_HASH_P2 }] })
  })

  it(
    'returns 400 PASSWORD_TOO_SHORT for any new_password shorter than 8 characters',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate new_password values with length 0–7
          fc.string({ maxLength: 7 }),
          async (shortPassword) => {
            pool.query.mockReset()
            pool.query
              .mockResolvedValueOnce({ rows: [{ is_active: true }] })
              .mockResolvedValueOnce({ rows: [{ password_hash: CORRECT_PASSWORD_HASH_P2 }] })

            const token = makeToken()
            const res = await request(app)
              .post('/api/auth/change-password')
              .set('Authorization', `Bearer ${token}`)
              .send({ current_password: CORRECT_PASSWORD, new_password: shortPassword })

            expect(res.status).toBe(400)
            expect(res.body.error.code).toBe('PASSWORD_TOO_SHORT')
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})

// Feature: noneco-enhancements, Property 3: Password Change Round-Trip

/**
 * Property 3: Password Change Round-Trip
 *
 * For any authenticated user, after a successful password change to a new
 * password P, authenticating with P should succeed and authenticating with
 * the old password should fail.
 *
 * Practical approach (unit test with mocked DB):
 * - Call change-password with the correct current_password and a generated newPassword → expect 200
 * - Verify the UPDATE query was called with a new bcrypt hash (not the old one)
 * - Call change-password again with the OLD password as current_password, but mock the DB to
 *   return the NEW hash (simulating the DB was updated) → expect 400 INVALID_PASSWORD
 *
 * Validates: Requirements 1.6
 */

describe('Property 3: Password Change Round-Trip', () => {
  let app
  let CORRECT_PASSWORD_HASH_P3

  const OLD_PASSWORD = 'old-password-abc'

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildTestApp()

    if (!CORRECT_PASSWORD_HASH_P3) {
      CORRECT_PASSWORD_HASH_P3 = await bcrypt.hash(OLD_PASSWORD, 10)
    }
  })

  it(
    'after a successful password change, the old password no longer authenticates',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate new passwords that differ from the old one
          fc.string({ minLength: 8 }).filter((s) => s !== OLD_PASSWORD),
          async (newPassword) => {
            pool.query.mockReset()

            // --- Step 1: change-password with correct current_password ---
            // authenticate middleware: is_active check
            pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
            // change-password handler: SELECT password_hash
            pool.query.mockResolvedValueOnce({ rows: [{ password_hash: CORRECT_PASSWORD_HASH_P3 }] })
            // change-password handler: UPDATE users SET password_hash
            pool.query.mockResolvedValueOnce({ rows: [] })

            const token = makeToken()
            const changeRes = await request(app)
              .post('/api/auth/change-password')
              .set('Authorization', `Bearer ${token}`)
              .send({ current_password: OLD_PASSWORD, new_password: newPassword })

            // Password change must succeed
            expect(changeRes.status).toBe(200)
            expect(changeRes.body.message).toBe('Password changed successfully.')

            // Verify the UPDATE was called with a new bcrypt hash (3rd pool.query call)
            const updateCall = pool.query.mock.calls.find(
              (call) => typeof call[0] === 'string' && call[0].startsWith('UPDATE users SET password_hash'),
            )
            expect(updateCall).toBeDefined()
            const newHashStored = updateCall[1][0]
            // The stored hash must NOT match the old password
            const oldMatchesNew = await bcrypt.compare(OLD_PASSWORD, newHashStored)
            expect(oldMatchesNew).toBe(false)
            // The stored hash MUST match the new password
            const newMatchesNew = await bcrypt.compare(newPassword, newHashStored)
            expect(newMatchesNew).toBe(true)

            // --- Step 2: attempt change-password with the OLD password as current_password ---
            // Now the DB holds the new hash; simulate that by returning newHashStored
            pool.query.mockReset()
            // authenticate middleware: is_active check
            pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
            // change-password handler: SELECT password_hash → returns the NEW hash
            pool.query.mockResolvedValueOnce({ rows: [{ password_hash: newHashStored }] })

            const retryRes = await request(app)
              .post('/api/auth/change-password')
              .set('Authorization', `Bearer ${token}`)
              .send({ current_password: OLD_PASSWORD, new_password: 'another-new-pass-xyz' })

            // Old password must no longer work
            expect(retryRes.status).toBe(400)
            expect(retryRes.body.error.code).toBe('INVALID_PASSWORD')
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})

// Feature: noneco-enhancements, Property 4: Password Change Scoped to Authenticated User

/**
 * Property 4: Password Change Scoped to Authenticated User
 *
 * For any authenticated user U1, calling POST /api/auth/change-password should
 * only modify U1's password — regardless of any user ID included in the request
 * body. U2's password should remain unchanged.
 *
 * The endpoint must always use req.user.id (from the JWT) for the UPDATE query,
 * never any user_id supplied in the request body.
 *
 * Validates: Requirements 1.7
 */

describe('Property 4: Password Change Scoped to Authenticated User', () => {
  let app

  const U1_ID = 'u1-uuid-0000-0000-0000-000000000001'
  const U2_ID = 'u2-uuid-0000-0000-0000-000000000002'
  const U1_PASSWORD = 'u1-correct-password'
  let U1_PASSWORD_HASH

  beforeEach(async () => {
    vi.clearAllMocks()
    app = buildTestApp()

    if (!U1_PASSWORD_HASH) {
      U1_PASSWORD_HASH = await bcrypt.hash(U1_PASSWORD, 10)
    }
  })

  it(
    'UPDATE query always uses U1 ID from JWT, never any user_id from the request body',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary user IDs to include in the request body
          // (attacker tries to change another user's password by injecting a user_id)
          fc.oneof(
            fc.constant(U2_ID),
            fc.uuidV(4),
            fc.string({ minLength: 1, maxLength: 64 }),
          ),
          async (injectedUserId) => {
            pool.query.mockReset()

            // authenticate middleware: is_active check for U1
            pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
            // change-password handler: SELECT password_hash for U1
            pool.query.mockResolvedValueOnce({ rows: [{ password_hash: U1_PASSWORD_HASH }] })
            // change-password handler: UPDATE users SET password_hash
            pool.query.mockResolvedValueOnce({ rows: [] })

            // U1 is authenticated via JWT
            const u1Token = makeToken(U1_ID)

            const res = await request(app)
              .post('/api/auth/change-password')
              .set('Authorization', `Bearer ${u1Token}`)
              .send({
                current_password: U1_PASSWORD,
                new_password: 'new-valid-password-xyz',
                // Attacker injects a different user_id in the body
                user_id: injectedUserId,
              })

            // The request must succeed (U1's credentials are valid)
            expect(res.status).toBe(200)

            // The SELECT query must use U1's ID (from JWT), not the injected ID
            const selectCall = pool.query.mock.calls.find(
              (call) =>
                typeof call[0] === 'string' &&
                call[0].includes('SELECT password_hash FROM users WHERE id'),
            )
            expect(selectCall).toBeDefined()
            expect(selectCall[1][0]).toBe(U1_ID)
            expect(selectCall[1][0]).not.toBe(injectedUserId)

            // The UPDATE query must use U1's ID (from JWT), not the injected ID
            const updateCall = pool.query.mock.calls.find(
              (call) =>
                typeof call[0] === 'string' &&
                call[0].startsWith('UPDATE users SET password_hash'),
            )
            expect(updateCall).toBeDefined()
            // The second parameter of the UPDATE is the user ID (WHERE id = $2)
            expect(updateCall[1][1]).toBe(U1_ID)
            expect(updateCall[1][1]).not.toBe(injectedUserId)
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'U2 password is never touched when U1 changes their password',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary new passwords for U1
          fc.string({ minLength: 8 }).filter((s) => s !== U1_PASSWORD),
          async (newPassword) => {
            pool.query.mockReset()

            // authenticate middleware: is_active check for U1
            pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
            // change-password handler: SELECT password_hash for U1
            pool.query.mockResolvedValueOnce({ rows: [{ password_hash: U1_PASSWORD_HASH }] })
            // change-password handler: UPDATE users SET password_hash
            pool.query.mockResolvedValueOnce({ rows: [] })

            const u1Token = makeToken(U1_ID)

            const res = await request(app)
              .post('/api/auth/change-password')
              .set('Authorization', `Bearer ${u1Token}`)
              .send({
                current_password: U1_PASSWORD,
                new_password: newPassword,
                // Attempt to target U2 via body
                user_id: U2_ID,
              })

            expect(res.status).toBe(200)

            // Verify no UPDATE was issued with U2's ID
            const updateCallsForU2 = pool.query.mock.calls.filter(
              (call) =>
                typeof call[0] === 'string' &&
                call[0].startsWith('UPDATE users SET password_hash') &&
                Array.isArray(call[1]) &&
                call[1].includes(U2_ID),
            )
            expect(updateCallsForU2).toHaveLength(0)

            // Verify the single UPDATE was issued with U1's ID
            const updateCallsForU1 = pool.query.mock.calls.filter(
              (call) =>
                typeof call[0] === 'string' &&
                call[0].startsWith('UPDATE users SET password_hash') &&
                Array.isArray(call[1]) &&
                call[1].includes(U1_ID),
            )
            expect(updateCallsForU1).toHaveLength(1)
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
