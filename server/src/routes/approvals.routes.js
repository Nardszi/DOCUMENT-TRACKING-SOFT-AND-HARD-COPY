import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'

const router = Router()

// ── Admin: CRUD approval flow templates ──────────────────────────────────────

// GET /api/approvals/flows — list all flows (admin sees all, others see active)
router.get('/flows', authenticate, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const q = isAdmin
      ? 'SELECT af.*, u.full_name AS created_by_name FROM approval_flows af JOIN users u ON u.id = af.created_by ORDER BY af.name ASC'
      : 'SELECT af.*, u.full_name AS created_by_name FROM approval_flows af JOIN users u ON u.id = af.created_by WHERE af.is_active = true ORDER BY af.name ASC'
    const result = await pool.query(q)
    res.json(result.rows.map(r => ({ ...r, created_by: { id: r.created_by, full_name: r.created_by_name }, created_by_name: undefined })))
  } catch (err) { next(err) }
})

// POST /api/approvals/flows — create flow (admin only)
router.post('/flows', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, description } = req.body
    if (!name || typeof name !== 'string' || !name.trim())
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name is required.' } })
    const result = await pool.query(
      'INSERT INTO approval_flows (name, description, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name.trim(), description || null, req.user.id])
    res.status(201).json({ id: result.rows[0].id, message: 'Approval flow created.' })
  } catch (err) { next(err) }
})

// PATCH /api/approvals/flows/:id — update flow (admin only)
router.patch('/flows/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, description, is_active } = req.body
    const sets = []; const vals = []
    if (name !== undefined) { vals.push(name.trim()); sets.push('name = $' + vals.length) }
    if (description !== undefined) { vals.push(description || null); sets.push('description = $' + vals.length) }
    if (is_active !== undefined) { vals.push(is_active); sets.push('is_active = $' + vals.length) }
    if (!sets.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No fields to update.' } })
    sets.push('updated_at = NOW()')
    vals.push(req.params.id)
    const result = await pool.query('UPDATE approval_flows SET ' + sets.join(', ') + ' WHERE id = $' + vals.length + ' RETURNING id', vals)
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Flow not found.' } })
    res.json({ message: 'Approval flow updated.' })
  } catch (err) { next(err) }
})

// DELETE /api/approvals/flows/:id — delete flow (admin only)
router.delete('/flows/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM approval_flows WHERE id = $1 RETURNING id', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Flow not found.' } })
    res.json({ message: 'Approval flow deleted.' })
  } catch (err) { next(err) }
})

// ── Steps within a flow ──────────────────────────────────────────────────────

// GET /api/approvals/flows/:id/steps — list steps for a flow
router.get('/flows/:id/steps', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT s.*, d.code AS department_code, d.name AS department_name, u.full_name AS approver_name' +
      ' FROM approval_flow_steps s' +
      ' LEFT JOIN departments d ON d.id = s.department_id' +
      ' LEFT JOIN users u ON u.id = s.approver_id' +
      ' WHERE s.flow_id = $1 ORDER BY s.step_order ASC', [req.params.id])
    res.json(result.rows)
  } catch (err) { next(err) }
})

// POST /api/approvals/flows/:id/steps — add step to flow (admin only)
router.post('/flows/:id/steps', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { label, approver_role, department_id, approver_id } = req.body
    if (!label || typeof label !== 'string' || !label.trim())
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'label is required.' } })
    const flowResult = await pool.query('SELECT id FROM approval_flows WHERE id = $1', [req.params.id])
    if (!flowResult.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Flow not found.' } })
    const maxResult = await pool.query('SELECT COALESCE(MAX(step_order), 0) + 1 AS next FROM approval_flow_steps WHERE flow_id = $1', [req.params.id])
    const stepOrder = maxResult.rows[0].next
    const result = await pool.query(
      'INSERT INTO approval_flow_steps (flow_id, step_order, label, approver_role, department_id, approver_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [req.params.id, stepOrder, label.trim(), approver_role || null, department_id || null, approver_id || null])
    res.status(201).json({ id: result.rows[0].id, message: 'Step added.' })
  } catch (err) { next(err) }
})

// DELETE /api/approvals/flows/:flowId/steps/:stepId — remove step (admin only)
router.delete('/flows/:flowId/steps/:stepId', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM approval_flow_steps WHERE id = $1 AND flow_id = $2 RETURNING id', [req.params.stepId, req.params.flowId])
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Step not found.' } })
    res.json({ message: 'Step removed.' })
  } catch (err) { next(err) }
})

// ── Document-level approvals ─────────────────────────────────────────────────

// POST /api/approvals/:documentId/assign — assign an approval flow to a document
router.post('/:documentId/assign', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params
    const { flow_id } = req.body
    if (!flow_id) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'flow_id is required.' } })

    // Check document exists and user has access
    const docResult = await pool.query('SELECT id, status FROM documents WHERE id = $1', [documentId])
    if (!docResult.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    if (docResult.rows[0].status === 'completed')
      return res.status(403).json({ error: { code: 'DOCUMENT_COMPLETED', message: 'Cannot assign approvals to a completed document.' } })

    // Check flow exists
    const flowResult = await pool.query('SELECT id, name FROM approval_flows WHERE id = $1 AND is_active = true', [flow_id])
    if (!flowResult.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Approval flow not found or inactive.' } })

    // Check no approvals already assigned
    const existing = await pool.query('SELECT id FROM document_approvals WHERE document_id = $1 LIMIT 1', [documentId])
    if (existing.rows.length) return res.status(409).json({ error: { code: 'CONFLICT', message: 'Approvals already assigned to this document.' } })

    // Get flow steps
    const stepsResult = await pool.query('SELECT * FROM approval_flow_steps WHERE flow_id = $1 ORDER BY step_order ASC', [flow_id])
    if (!stepsResult.rows.length) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Flow has no steps.' } })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const step of stepsResult.rows) {
        await client.query(
          'INSERT INTO document_approvals (document_id, flow_step_id, step_order, label, assigned_to, assigned_department_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [documentId, step.id, step.step_order, step.label, step.approver_id, step.department_id])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.status(201).json({ message: 'Approval flow assigned.' })
  } catch (err) { next(err) }
})

// POST /api/approvals/:approvalId/approve — approve a step
router.post('/:approvalId/approve', authenticate, async (req, res, next) => {
  try {
    const { approvalId } = req.params
    const { comment } = req.body

    const apResult = await pool.query(
      'SELECT da.*, d.status AS doc_status FROM document_approvals da JOIN documents d ON d.id = da.document_id WHERE da.id = $1',
      [approvalId])
    if (!apResult.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Approval not found.' } })
    const ap = apResult.rows[0]
    if (ap.status !== 'pending') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Approval already ' + ap.status + '.' } })
    if (ap.doc_status === 'completed') return res.status(403).json({ error: { code: 'DOCUMENT_COMPLETED', message: 'Document is completed.' } })

    // Check user is authorized to approve this step
    const isDeptMatch = ap.assigned_department_id ? req.user.departmentId === ap.assigned_department_id : true
    const isUserMatch = ap.assigned_to ? req.user.id === ap.assigned_to : true
    const isAdmin = req.user.role === 'admin'
    if (!isAdmin && (!isDeptMatch || !isUserMatch))
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not authorized to approve this step.' } })

    await pool.query(
      "UPDATE document_approvals SET status = 'approved', comment = $1, decided_by = $2, decided_at = NOW() WHERE id = $3",
      [comment || null, req.user.id, approvalId])

    // Check if all steps are now approved — if so, update doc status to 'approved'
    const remaining = await pool.query(
      "SELECT id FROM document_approvals WHERE document_id = $1 AND status = 'pending' LIMIT 1",
      [ap.document_id])
    if (!remaining.rows.length) {
      await pool.query(
        "UPDATE documents SET status = 'forwarded', updated_at = NOW() WHERE id = $1",
        [ap.document_id])
    }

    res.json({ message: 'Step approved.' })
  } catch (err) { next(err) }
})

// POST /api/approvals/:approvalId/reject — reject a step
router.post('/:approvalId/reject', authenticate, async (req, res, next) => {
  try {
    const { approvalId } = req.params
    const { comment } = req.body
    if (!comment || typeof comment !== 'string' || !comment.trim())
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'comment is required when rejecting.' } })

    const apResult = await pool.query(
      'SELECT da.*, d.status AS doc_status FROM document_approvals da JOIN documents d ON d.id = da.document_id WHERE da.id = $1',
      [approvalId])
    if (!apResult.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Approval not found.' } })
    const ap = apResult.rows[0]
    if (ap.status !== 'pending') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Approval already ' + ap.status + '.' } })
    if (ap.doc_status === 'completed') return res.status(403).json({ error: { code: 'DOCUMENT_COMPLETED', message: 'Document is completed.' } })

    const isDeptMatch = ap.assigned_department_id ? req.user.departmentId === ap.assigned_department_id : true
    const isUserMatch = ap.assigned_to ? req.user.id === ap.assigned_to : true
    const isAdmin = req.user.role === 'admin'
    if (!isAdmin && (!isDeptMatch || !isUserMatch))
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not authorized to reject this step.' } })

    await pool.query(
      "UPDATE document_approvals SET status = 'rejected', comment = $1, decided_by = $2, decided_at = NOW() WHERE id = $3",
      [comment.trim(), req.user.id, approvalId])

    res.json({ message: 'Step rejected.' })
  } catch (err) { next(err) }
})

// GET /api/approvals/:documentId/approvals — list approvals for a document
router.get('/:documentId/approvals', authenticate, async (req, res, next) => {
  try {
    const { documentId } = req.params
    const docCheck = await pool.query('SELECT d.id FROM documents d WHERE d.id = $1', [documentId])
    if (!docCheck.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })

    const result = await pool.query(
      `SELECT da.*, dec.full_name AS decided_by_name, dep.code AS department_code
       FROM document_approvals da
       LEFT JOIN users dec ON dec.id = da.decided_by
       LEFT JOIN departments dep ON dep.id = da.assigned_department_id
       WHERE da.document_id = $1 ORDER BY da.step_order ASC`, [documentId])
    res.json(result.rows)
  } catch (err) { next(err) }
})

// GET /api/approvals/pending — list pending approvals for current user
router.get('/pending', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT da.id, da.document_id, da.step_order, da.label, da.status, da.created_at,
              d.tracking_number, d.title, d.status AS doc_status,
              u.full_name AS creator_name
       FROM document_approvals da
       JOIN documents d ON d.id = da.document_id
       JOIN users u ON u.id = d.created_by
       WHERE da.status = 'pending'
         AND (da.assigned_to = $1 OR (da.assigned_to IS NULL AND da.assigned_department_id = $2))
       ORDER BY da.created_at DESC`,
      [req.user.id, req.user.departmentId])
    res.json(result.rows)
  } catch (err) { next(err) }
})

export default router
