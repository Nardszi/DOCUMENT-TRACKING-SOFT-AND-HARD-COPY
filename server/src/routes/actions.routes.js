import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireHeadOrAdmin } from '../middleware/rbac.js'

const router = Router()

const VALID_ACTION_TYPES = ['Received', 'Reviewed', 'Approved', 'Returned']

// POST /:documentId/actions — record an action (Req 4.1, 4.2)
router.post('/:documentId/actions', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params
    const { action_type, remarks } = req.body

    if (!action_type) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'action_type is required.' } })
    }
    if (!VALID_ACTION_TYPES.includes(action_type)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: `action_type must be one of: ${VALID_ACTION_TYPES.join(', ')}.` } })
    }

    const docResult = await pool.query('SELECT id, status FROM documents WHERE id = $1', [documentId])
    if (!docResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }
    if (docResult.rows[0].status === 'completed') {
      return res.status(403).json({ error: { code: 'DOCUMENT_COMPLETED', message: 'Cannot record actions on a completed document.' } })
    }

    const { rows } = await pool.query(
      `INSERT INTO tracking_log (document_id, user_id, department_id, event_type, remarks, metadata)
       VALUES ($1, $2, $3, 'action_recorded', $4, $5)
       RETURNING id, document_id, user_id, department_id, remarks, metadata, created_at`,
      [documentId, req.user.id, req.user.departmentId, remarks || null, JSON.stringify({ action_type })]
    )

    const log = rows[0]
    res.status(201).json({ id: log.id, document_id: log.document_id, action_type, remarks: log.remarks, user_id: log.user_id, department_id: log.department_id, created_at: log.created_at })
  } catch (err) {
    next(err)
  }
})

// PATCH /:documentId/complete — mark document as completed (Req 4.3, 4.4)
router.patch('/:documentId/complete', authenticate, requireHeadOrAdmin, async (req, res, next) => {
  try {
    const { documentId } = req.params

    const docResult = await pool.query('SELECT id, status FROM documents WHERE id = $1', [documentId])
    if (!docResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }
    if (docResult.rows[0].status === 'completed') {
      return res.status(400).json({ error: { code: 'ALREADY_COMPLETED', message: 'Document is already completed.' } })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const updateResult = await client.query(
        `UPDATE documents SET status = 'completed', updated_at = NOW() WHERE id = $1
         RETURNING id, tracking_number, title, status, updated_at`,
        [documentId]
      )
      await client.query(
        `INSERT INTO tracking_log (document_id, user_id, department_id, event_type, remarks, metadata)
         VALUES ($1, $2, $3, 'completed', NULL, NULL)`,
        [documentId, req.user.id, req.user.departmentId]
      )
      await client.query('COMMIT')
      const doc = updateResult.rows[0]
      res.json({ id: doc.id, tracking_number: doc.tracking_number, title: doc.title, status: doc.status, updated_at: doc.updated_at })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    next(err)
  }
})

export default router
