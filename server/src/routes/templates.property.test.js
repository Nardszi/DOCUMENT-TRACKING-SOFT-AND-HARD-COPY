// Feature: noneco-enhancements, Property 22: Template CRUD Round-Trip
// Feature: noneco-enhancements, Property 23: Deactivated Templates Hidden from Non-Admin
// Feature: noneco-enhancements, Property 24: Template ID Recorded in Tracking Log on Document Creation

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

// Mock QR service used by documents.routes.js
vi.mock('../services/qr.service.js', () => ({
  generateQRCode: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}))

// Mock tracking number generator
vi.mock('../utils/trackingNumber.js', () => ({
  generateTrackingNumber: vi.fn().mockResolvedValue('NONECO-20250101-00001'),
}))

import pool from '../db/pool.js'
import templatesRouter from './templates.routes.js'
import documentsRouter from './documents.routes.js'

const JWT_SECRET = 'dev-secret-change-in-production'

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function makeAdminToken(userId = 'admin-user-uuid-0001') {
  return jwt.sign(
    { sub: userId, role: 'admin', departmentId: 'dept-uuid-0001', fullName: 'Admin User' },
    JWT_SECRET,
    { expiresIn: '30m' },
  )
}

function makeStaffToken(userId = 'staff-user-uuid-0001') {
  return jwt.sign(
    { sub: userId, role: 'staff', departmentId: 'dept-uuid-0001', fullName: 'Staff User' },
    JWT_SECRET,
    { expiresIn: '30m' },
  )
}

// ---------------------------------------------------------------------------
// App builders
// ---------------------------------------------------------------------------

function buildTemplatesApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/templates', templatesRouter)
  return app
}

function buildDocumentsApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/documents', documentsRouter)
  return app
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbTemplateName = fc.string({ minLength: 1, maxLength: 100 })
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

const arbTitlePrefix = fc.option(
  fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.trim()).filter((s) => s.length > 0),
  { nil: null },
)

const arbPriority = fc.constantFrom('low', 'normal', 'high', 'urgent')

const arbUuidOrNull = fc.option(fc.uuidV(4), { nil: null })

const arbTemplateFields = fc.record({
  name: arbTemplateName,
  title_prefix: arbTitlePrefix,
  category_id: arbUuidOrNull,
  originating_department_id: arbUuidOrNull,
  description: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  priority: arbPriority,
})

// ---------------------------------------------------------------------------
// Property 22: Template CRUD Round-Trip
// ---------------------------------------------------------------------------

/**
 * Property 22: Template CRUD Round-Trip
 *
 * For any valid template object (name, optional title_prefix, category_id,
 * originating_department_id, description, priority), creating it via
 * POST /api/templates and then fetching it via GET /api/templates should
 * return an object with all submitted fields intact.
 *
 * Validates: Requirements 7.1, 7.2
 */
describe('Property 22: Template CRUD Round-Trip', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildTemplatesApp()
  })

  it('GET /api/templates returns the created template with all submitted fields intact', async () => {
    await fc.assert(
      fc.asyncProperty(arbTemplateFields, async (fields) => {
        pool.query.mockReset()

        const createdTemplate = {
          id: 'template-uuid-0001',
          name: fields.name,
          title_prefix: fields.title_prefix ?? null,
          category_id: fields.category_id ?? null,
          originating_department_id: fields.originating_department_id ?? null,
          description: fields.description ?? null,
          priority: fields.priority,
          is_active: true,
          created_by: 'admin-user-uuid-0001',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        // authenticate middleware: is_active check
        pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
        // POST /api/templates: INSERT INTO document_templates
        pool.query.mockResolvedValueOnce({ rows: [createdTemplate] })

        const adminToken = makeAdminToken()
        const postRes = await request(app)
          .post('/api/templates')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(fields)

        expect(postRes.status).toBe(201)

        // authenticate middleware: is_active check for GET
        pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
        // GET /api/templates: SELECT from document_templates (admin sees all)
        pool.query.mockResolvedValueOnce({ rows: [createdTemplate] })

        const getRes = await request(app)
          .get('/api/templates')
          .set('Authorization', `Bearer ${adminToken}`)

        expect(getRes.status).toBe(200)
        expect(Array.isArray(getRes.body)).toBe(true)

        const found = getRes.body.find((t) => t.id === createdTemplate.id)
        expect(found).toBeDefined()

        // All submitted fields must be present in the returned template
        expect(found.name).toBe(fields.name)
        expect(found.priority).toBe(fields.priority)
        if (fields.title_prefix !== null) {
          expect(found.title_prefix).toBe(fields.title_prefix)
        }
        if (fields.category_id !== null) {
          expect(found.category_id).toBe(fields.category_id)
        }
        if (fields.originating_department_id !== null) {
          expect(found.originating_department_id).toBe(fields.originating_department_id)
        }
        if (fields.description !== null) {
          expect(found.description).toBe(fields.description)
        }
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 23: Deactivated Templates Hidden from Non-Admin
// ---------------------------------------------------------------------------

/**
 * Property 23: Deactivated Templates Hidden from Non-Admin
 *
 * For any deactivated template, GET /api/templates called by a non-admin user
 * should not include that template in the response, while the template should
 * still exist in the database (retrievable by admin).
 *
 * Validates: Requirements 7.3, 7.6
 */
describe('Property 23: Deactivated Templates Hidden from Non-Admin', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildTemplatesApp()
  })

  it('non-admin GET /api/templates does not include deactivated templates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuidV(4),
          name: arbTemplateName,
          priority: arbPriority,
        }),
        async ({ id, name, priority }) => {
          pool.query.mockReset()

          const deactivatedTemplate = {
            id,
            name,
            title_prefix: null,
            category_id: null,
            originating_department_id: null,
            description: null,
            priority,
            is_active: false,
            created_by: 'admin-user-uuid-0001',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

          // --- Non-admin request: should NOT see deactivated template ---
          // authenticate middleware: is_active check for staff
          pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
          // GET /api/templates for non-admin: WHERE is_active = true → empty (deactivated template excluded)
          pool.query.mockResolvedValueOnce({ rows: [] })

          const staffToken = makeStaffToken()
          const staffRes = await request(app)
            .get('/api/templates')
            .set('Authorization', `Bearer ${staffToken}`)

          expect(staffRes.status).toBe(200)
          expect(Array.isArray(staffRes.body)).toBe(true)

          // Deactivated template must NOT appear in non-admin response
          const foundInStaffRes = staffRes.body.find((t) => t.id === id)
          expect(foundInStaffRes).toBeUndefined()

          // --- Admin request: SHOULD see deactivated template ---
          // authenticate middleware: is_active check for admin
          pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
          // GET /api/templates for admin: no WHERE is_active filter → returns all including deactivated
          pool.query.mockResolvedValueOnce({ rows: [deactivatedTemplate] })

          const adminToken = makeAdminToken()
          const adminRes = await request(app)
            .get('/api/templates')
            .set('Authorization', `Bearer ${adminToken}`)

          expect(adminRes.status).toBe(200)
          expect(Array.isArray(adminRes.body)).toBe(true)

          // Deactivated template MUST appear in admin response
          const foundInAdminRes = adminRes.body.find((t) => t.id === id)
          expect(foundInAdminRes).toBeDefined()
          expect(foundInAdminRes.is_active).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 24: Template ID Recorded in Tracking Log on Document Creation
// ---------------------------------------------------------------------------

/**
 * Property 24: Template ID Recorded in Tracking Log on Document Creation
 *
 * For any document created with a template_id, the tracking log entry of type
 * 'created' for that document should have a metadata field containing the
 * template_id.
 *
 * Validates: Requirements 7.8
 */
describe('Property 24: Template ID Recorded in Tracking Log on Document Creation', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildDocumentsApp()
  })

  it('tracking_log INSERT includes metadata with template_id when document is created from a template', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          templateId: fc.uuidV(4),
          categoryId: fc.uuidV(4),
          departmentId: fc.uuidV(4),
          title: fc.string({ minLength: 1, maxLength: 80 }).map((s) => s.trim()).filter((s) => s.length > 0),
        }),
        async ({ templateId, categoryId, departmentId, title }) => {
          pool.query.mockReset()

          const docId = 'doc-uuid-0001'
          const userId = 'staff-user-uuid-0001'

          // authenticate middleware: is_active check
          pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
          // Validate category: SELECT id FROM document_categories WHERE id = $1 AND is_active = true
          pool.query.mockResolvedValueOnce({ rows: [{ id: categoryId }] })
          // Validate department: SELECT id FROM departments WHERE id = $1
          pool.query.mockResolvedValueOnce({ rows: [{ id: departmentId }] })

          // pool.connect() for transaction
          const mockClient = {
            query: vi.fn(),
            release: vi.fn(),
          }
          pool.connect.mockResolvedValueOnce(mockClient)

          // BEGIN
          mockClient.query.mockResolvedValueOnce({})
          // generateTrackingNumber uses client.query internally — already mocked via vi.mock
          // INSERT INTO documents
          mockClient.query.mockResolvedValueOnce({
            rows: [{
              id: docId,
              tracking_number: 'NONECO-20250101-00001',
              title,
              category_id: categoryId,
              originating_department_id: departmentId,
              current_department_id: departmentId,
              description: null,
              status: 'pending',
              priority: 'normal',
              deadline: null,
              created_by: userId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
          })
          // INSERT INTO tracking_log
          mockClient.query.mockResolvedValueOnce({ rows: [] })
          // COMMIT
          mockClient.query.mockResolvedValueOnce({})

          const staffToken = makeStaffToken(userId)
          const res = await request(app)
            .post('/api/documents')
            .set('Authorization', `Bearer ${staffToken}`)
            .send({
              title,
              category_id: categoryId,
              originating_department_id: departmentId,
              template_id: templateId,
            })

          expect(res.status).toBe(201)

          // Find the INSERT INTO tracking_log call on the client
          const trackingLogCall = mockClient.query.mock.calls.find(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('INSERT INTO tracking_log'),
          )

          expect(trackingLogCall).toBeDefined()

          // The 4th parameter ($4) is the metadata — should be JSON with template_id
          const metadataArg = trackingLogCall[1][3]
          expect(metadataArg).not.toBeNull()

          const metadata = typeof metadataArg === 'string' ? JSON.parse(metadataArg) : metadataArg
          expect(metadata).toHaveProperty('template_id', templateId)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('tracking_log INSERT has null metadata when no template_id is provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          categoryId: fc.uuidV(4),
          departmentId: fc.uuidV(4),
          title: fc.string({ minLength: 1, maxLength: 80 }).map((s) => s.trim()).filter((s) => s.length > 0),
        }),
        async ({ categoryId, departmentId, title }) => {
          pool.query.mockReset()

          const docId = 'doc-uuid-0002'
          const userId = 'staff-user-uuid-0001'

          // authenticate middleware: is_active check
          pool.query.mockResolvedValueOnce({ rows: [{ is_active: true }] })
          // Validate category
          pool.query.mockResolvedValueOnce({ rows: [{ id: categoryId }] })
          // Validate department
          pool.query.mockResolvedValueOnce({ rows: [{ id: departmentId }] })

          const mockClient = {
            query: vi.fn(),
            release: vi.fn(),
          }
          pool.connect.mockResolvedValueOnce(mockClient)

          // BEGIN
          mockClient.query.mockResolvedValueOnce({})
          // INSERT INTO documents
          mockClient.query.mockResolvedValueOnce({
            rows: [{
              id: docId,
              tracking_number: 'NONECO-20250101-00002',
              title,
              category_id: categoryId,
              originating_department_id: departmentId,
              current_department_id: departmentId,
              description: null,
              status: 'pending',
              priority: 'normal',
              deadline: null,
              created_by: userId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
          })
          // INSERT INTO tracking_log
          mockClient.query.mockResolvedValueOnce({ rows: [] })
          // COMMIT
          mockClient.query.mockResolvedValueOnce({})

          const staffToken = makeStaffToken(userId)
          const res = await request(app)
            .post('/api/documents')
            .set('Authorization', `Bearer ${staffToken}`)
            .send({
              title,
              category_id: categoryId,
              originating_department_id: departmentId,
              // No template_id
            })

          expect(res.status).toBe(201)

          const trackingLogCall = mockClient.query.mock.calls.find(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('INSERT INTO tracking_log'),
          )

          expect(trackingLogCall).toBeDefined()

          // metadata ($4) should be null when no template_id is provided
          const metadataArg = trackingLogCall[1][3]
          expect(metadataArg).toBeNull()
        },
      ),
      { numRuns: 100 },
    )
  })
})
