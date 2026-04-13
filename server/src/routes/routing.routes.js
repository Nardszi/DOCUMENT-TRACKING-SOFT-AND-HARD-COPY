import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { createNotificationsForDept } from '../services/notification.service.js'
import { recordAudit } from '../utils/audit.js'

const router = Router()

// ---------------------------------------------------------------------------
// POST /:documentId/forward — forward document to another department
// Requirements: 3.1, 3.2, 3.3, 3.5, 14.1, 14.2, 15.1, 15.3
// ---------------------------------------------------------------------------
router.post('/:documentId/forward', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params
    const { to_department_id, routing_note, cc_department_ids } = req.body

    // Validate required fields
    if (!to_department_id) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'to_department_id is required.' },
      })
    }
    if (!routing_note || !routing_note.trim()) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'routing_note is required and must not be empty.' },
      })
    }

    const ccIds = Array.isArray(cc_department_ids) ? cc_department_ids : []

    // Check document exists
    const docResult = await pool.query(
      'SELECT id, tracking_number, title, status, current_department_id FROM documents WHERE id = $1',
      [documentId]
    )
    if (!docResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }

    const doc = docResult.rows[0]
    // Fetch destination department code for metadata
    const toDeptResult = await pool.query('SELECT code FROM departments WHERE id = $1', [to_department_id])
    const toDeptCode = toDeptResult.rows.length ? toDeptResult.rows[0].code : null

    // Block if already completed (Requirement 3.5)
    if (doc.status === 'completed') {
      return res.status(403).json({
        error: { code: 'DOCUMENT_COMPLETED', message: 'Cannot forward a completed document.' },
      })
    }

    // Execute in a transaction (Requirement 3.3)
    const client = await pool.connect()
    let updatedDoc
    let routingId

    try {
      await client.query('BEGIN')

      // 1. Update document
      const updateResult = await client.query(
        `UPDATE documents
         SET current_department_id = $1, status = 'forwarded', updated_at = NOW()
         WHERE id = $2
         RETURNING id, tracking_number, title, status, current_department_id`,
        [to_department_id, documentId]
      )
      updatedDoc = updateResult.rows[0]

      // 2. Insert routing row
      const routingResult = await client.query(
        `INSERT INTO routings
           (document_id, from_department_id, to_department_id, routing_note, routing_type, routed_by)
         VALUES ($1, $2, $3, $4, 'forward', $5)
         RETURNING id`,
        [documentId, req.user.departmentId, to_department_id, routing_note.trim(), req.user.id]
      )
      routingId = routingResult.rows[0].id

      // 3. Insert routing_cc rows
      for (const ccDeptId of ccIds) {
        await client.query(
          'INSERT INTO routing_cc (routing_id, department_id) VALUES ($1, $2)',
          [routingId, ccDeptId]
        )
      }

      // 4. Insert tracking log entry
      await client.query(
        `INSERT INTO tracking_log
           (document_id, user_id, department_id, event_type, metadata)
         VALUES ($1, $2, $3, 'forwarded', $4)`,
        [
          documentId,
          req.user.id,
          req.user.departmentId,
          JSON.stringify({ to_department_id, to_department_code: toDeptCode, routing_note: routing_note.trim(), cc_department_ids: ccIds }),
        ]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Notifications — best-effort (Requirement 14.1, 14.2, 15.1)
    try {
      const notifMessage = `Document '${doc.tracking_number}' has been forwarded to your department.`
      await createNotificationsForDept(pool, to_department_id, documentId, 'document_forwarded', notifMessage)

      const ccMessage = `Document '${doc.tracking_number}' has been forwarded and your department has been CC'd.`
      for (const ccDeptId of ccIds) {
        await createNotificationsForDept(pool, ccDeptId, documentId, 'document_cc', ccMessage)
      }
    } catch (notifErr) {
      console.error('[routing] notification error (non-fatal):', notifErr.message)
    }

    recordAudit(pool, req.user.id, 'document.forwarded', 'document', documentId, { to_department_id })
    res.json(updatedDoc)
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// POST /:documentId/return — return document to previous sender
// Requirements: 3.1, 3.2, 3.6, 14.3, 15.4
// ---------------------------------------------------------------------------
router.post('/:documentId/return', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params
    const { reason } = req.body

    // Validate required fields
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'reason is required and must not be empty.' },
      })
    }

    // Check document exists
    const docResult = await pool.query(
      'SELECT id, tracking_number, title, status, current_department_id FROM documents WHERE id = $1',
      [documentId]
    )
    if (!docResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }

    const doc = docResult.rows[0]
    
    // Block if already completed
    if (doc.status === 'completed') {
      return res.status(403).json({
        error: { code: 'DOCUMENT_COMPLETED', message: 'Cannot return a completed document.' },
      })
    }

    // Find previous sender: most recent routing where to_department_id = current dept
    const prevRoutingResult = await pool.query(
      `SELECT from_department_id
       FROM routings
       WHERE document_id = $1 AND to_department_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [documentId, doc.current_department_id]
    )

    if (!prevRoutingResult.rows.length) {
      return res.status(400).json({
        error: { code: 'NO_PREVIOUS_ROUTING', message: 'No previous routing found to return to.' },
      })
    }

    const previousFromDept = prevRoutingResult.rows[0].from_department_id

    // Execute in a transaction
    const client = await pool.connect()
    let updatedDoc

    try {
      await client.query('BEGIN')

      // 1. Update document
      const updateResult = await client.query(
        `UPDATE documents
         SET current_department_id = $1, status = 'returned', updated_at = NOW()
         WHERE id = $2
         RETURNING id, tracking_number, title, status, current_department_id`,
        [previousFromDept, documentId]
      )
      updatedDoc = updateResult.rows[0]

      // 2. Insert routing row
      await client.query(
        `INSERT INTO routings
           (document_id, from_department_id, to_department_id, routing_note, routing_type, routed_by)
         VALUES ($1, $2, $3, $4, 'return', $5)`,
        [documentId, req.user.departmentId, previousFromDept, reason.trim(), req.user.id]
      )

      // 3. Insert tracking log entry
      await client.query(
        `INSERT INTO tracking_log
           (document_id, user_id, department_id, event_type, remarks, metadata)
         VALUES ($1, $2, $3, 'returned', $4, $5)`,
        [
          documentId,
          req.user.id,
          req.user.departmentId,
          reason.trim(),
          JSON.stringify({ to_department_id: previousFromDept }),
        ]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Notifications — best-effort (Requirement 14.3, 15.4)
    try {
      const notifMessage = `Document '${doc.tracking_number}' has been returned to your department.`
      await createNotificationsForDept(pool, previousFromDept, documentId, 'document_returned', notifMessage)
    } catch (notifErr) {
      console.error('[routing] notification error (non-fatal):', notifErr.message)
    }

    recordAudit(pool, req.user.id, 'document.returned', 'document', documentId, { to_department_id: previousFromDept })
    res.json(updatedDoc)
  } catch (err) {
    next(err)
  }
})

export default router
