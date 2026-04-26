import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { createNotificationsForDept } from '../services/notification.service.js'
import { recordAudit } from '../utils/audit.js'
import { isEmailEnabled, sendRecalledEmail } from '../services/email.service.js'

const router = Router()

// ---------------------------------------------------------------------------
// POST /:documentId/recall — originating dept requests to recall a document
// ---------------------------------------------------------------------------
router.post('/:documentId/recall', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params
    const { reason } = req.body

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'reason is required.' } })
    }

    // Fetch document
    const docResult = await pool.query(
      `SELECT d.id, d.tracking_number, d.title, d.status,
              d.originating_department_id, d.current_department_id,
              od.name AS originating_dept_name, cd.name AS current_dept_name
       FROM documents d
       JOIN departments od ON od.id = d.originating_department_id
       JOIN departments cd ON cd.id = d.current_department_id
       WHERE d.id = $1`,
      [documentId]
    )

    if (!docResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }

    const doc = docResult.rows[0]

    // Only the originating department (or admin) can recall
    if (req.user.role !== 'admin' && req.user.departmentId !== doc.originating_department_id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the originating department can recall this document.' } })
    }

    // Can't recall if already completed or already in originating dept
    if (doc.status === 'completed') {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot recall a completed document.' } })
    }
    if (doc.current_department_id === doc.originating_department_id) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Document is already in the originating department.' } })
    }

    // Check no pending recall already exists
    const existingRecall = await pool.query(
      "SELECT id FROM document_recalls WHERE document_id = $1 AND status = 'pending'",
      [documentId]
    )
    if (existingRecall.rows.length) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A recall request is already pending for this document.' } })
    }

    const client = await pool.connect()
    let recall
    try {
      await client.query('BEGIN')

      // Insert recall record
      const recallResult = await client.query(
        `INSERT INTO document_recalls (document_id, requested_by, reason, status)
         VALUES ($1, $2, $3, 'approved')
         RETURNING id, created_at`,
        [documentId, req.user.id, reason.trim()]
      )
      recall = recallResult.rows[0]

      // Move document back to originating department
      await client.query(
        `UPDATE documents
         SET current_department_id = originating_department_id,
             status = 'returned',
             updated_at = NOW()
         WHERE id = $1`,
        [documentId]
      )

      // Insert tracking log entry
      await client.query(
        `INSERT INTO tracking_log (document_id, user_id, department_id, event_type, remarks, metadata)
         VALUES ($1, $2, $3, 'returned', $4, $5)`,
        [
          documentId,
          req.user.id,
          req.user.departmentId,
          reason.trim(),
          JSON.stringify({ recall: true, from_department_id: doc.current_department_id }),
        ]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Notify the department that had the document
    try {
      const notifMessage = `Document '${doc.tracking_number}' has been recalled by the originating department (${doc.originating_dept_name}).`
      await createNotificationsForDept(pool, doc.current_department_id, documentId, 'document_returned', notifMessage)
    } catch (notifErr) {
      console.warn('[recall] notification error (non-fatal):', notifErr.message)
    }

    // Send recall emails
    try {
      const emailEnabled = await isEmailEnabled()
      if (emailEnabled) {
        const usersResult = await pool.query(
          'SELECT email FROM users WHERE department_id = $1 AND is_active = TRUE',
          [doc.current_department_id]
        )
        for (const u of usersResult.rows) {
          if (!u.email) continue
          sendRecalledEmail(u.email, {
            documentTitle: doc.title,
            trackingNumber: doc.tracking_number,
            recalledBy: doc.originating_dept_name,
            reason: reason.trim(),
            documentId,
          }).catch(err => console.warn('[recall] email failed:', err.message))
        }
      }
    } catch (emailErr) {
      console.warn('[recall] email error (non-fatal):', emailErr.message)
    }

    recordAudit(pool, req.user.id, 'document.recalled', 'document', documentId, {
      reason: reason.trim(),
      from_department_id: doc.current_department_id,
    })

    res.json({ success: true, recall_id: recall.id, message: 'Document recalled successfully.' })
  } catch (err) {
    next(err)
  }
})

export default router
