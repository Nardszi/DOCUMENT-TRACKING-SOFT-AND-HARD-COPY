import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { generateTrackingNumber } from '../utils/trackingNumber.js'
import { generateQRCode } from '../services/qr.service.js'
import { recordAudit } from '../utils/audit.js'

const router = Router()

const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent']

function buildScopeClause(user, startIdx) {
  if (user.role === 'admin') return { clause: 'TRUE', params: [] }
  const deptId = user.departmentId
  const params = [deptId]
  const p = '$' + startIdx
  if (user.role === 'department_head') {
    const clause = '(' +
      'd.originating_department_id = ' + p +
      ' OR d.current_department_id = ' + p +
      ' OR EXISTS (SELECT 1 FROM routings r WHERE r.document_id = d.id AND (r.from_department_id = ' + p + ' OR r.to_department_id = ' + p + '))' +
      ' OR EXISTS (SELECT 1 FROM routing_cc rcc JOIN routings r2 ON r2.id = rcc.routing_id WHERE r2.document_id = d.id AND rcc.department_id = ' + p + ')' +
      ')'
    return { clause, params }
  }
  const clause = '(' +
    'd.current_department_id = ' + p +
    ' OR EXISTS (SELECT 1 FROM routings r WHERE r.document_id = d.id AND (r.from_department_id = ' + p + ' OR r.to_department_id = ' + p + '))' +
    ' OR EXISTS (SELECT 1 FROM routing_cc rcc JOIN routings r2 ON r2.id = rcc.routing_id WHERE r2.document_id = d.id AND rcc.department_id = ' + p + ')' +
    ')'
  return { clause, params }
}

function formatDoc(row) {
  return {
    id: row.id,
    tracking_number: row.tracking_number,
    title: row.title,
    category: { id: row.category_id, name: row.category_name },
    originating_department: { id: row.originating_department_id, code: row.originating_department_code, name: row.originating_department_name },
    current_department: { id: row.current_department_id, code: row.current_department_code, name: row.current_department_name },
    description: row.description,
    status: row.status,
    priority: row.priority,
    deadline: row.deadline,
    is_overdue: row.is_overdue,
    created_by: { id: row.created_by, full_name: row.creator_full_name },
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const DOC_SELECT_FULL =
  'd.id, d.tracking_number, d.title, d.category_id, dc.name AS category_name,' +
  ' d.originating_department_id, od.code AS originating_department_code, od.name AS originating_department_name,' +
  ' d.current_department_id, cd.code AS current_department_code, cd.name AS current_department_name,' +
  ' d.description, d.status, d.priority, d.deadline, d.created_by, u.full_name AS creator_full_name,' +
  ' d.created_at, d.updated_at,' +
  " (d.deadline IS NOT NULL AND d.deadline < CURRENT_DATE AND d.status != 'completed') AS is_overdue"

const DOC_JOINS_FULL =
  ' FROM documents d' +
  ' JOIN document_categories dc ON dc.id = d.category_id' +
  ' JOIN departments od ON od.id = d.originating_department_id' +
  ' JOIN departments cd ON cd.id = d.current_department_id' +
  ' JOIN users u ON u.id = d.created_by'

// POST / -- create document
router.post('/', authenticate, async (req, res, next) => {
  const { title, category_id, originating_department_id, description, priority, deadline, template_id } = req.body
  if (!title || typeof title !== 'string' || !title.trim())
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'title is required.' } })
  if (!category_id)
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'category_id is required.' } })
  if (!originating_department_id)
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'originating_department_id is required.' } })
  const normPri = priority ? priority.toLowerCase() : 'normal'
  if (!VALID_PRIORITIES.includes(normPri))
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'priority must be one of: ' + VALID_PRIORITIES.join(', ') + '.' } })
  try {
    const catResult = await pool.query('SELECT id FROM document_categories WHERE id = $1 AND is_active = true', [category_id])
    if (!catResult.rows.length)
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'category_id is invalid or inactive.' } })
    const deptResult = await pool.query('SELECT id FROM departments WHERE id = $1', [originating_department_id])
    if (!deptResult.rows.length)
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'originating_department_id does not exist.' } })
    const client = await pool.connect()
    let rows
    try {
      await client.query('BEGIN')
      const tracking_number = await generateTrackingNumber(client)
      const result = await client.query(
        'INSERT INTO documents (tracking_number, title, category_id, originating_department_id, current_department_id, description, priority, deadline, created_by)' +
        ' VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8)' +
        ' RETURNING id, tracking_number, title, category_id, originating_department_id, current_department_id, description, status, priority, deadline, created_by, created_at, updated_at',
        [tracking_number, title.trim(), category_id, originating_department_id, description || null, normPri, deadline || null, req.user.id]
      )
      const doc = result.rows[0]
      await client.query(
        "INSERT INTO tracking_log (document_id, user_id, department_id, event_type, metadata) VALUES ($1, $2, $3, 'created', $4)",
        [doc.id, req.user.id, originating_department_id, template_id ? JSON.stringify({ template_id }) : null]
      )
      await client.query('COMMIT')
      rows = result.rows
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally { client.release() }
    res.status(201).json(rows[0])
    recordAudit(pool, req.user.id, 'document.created', 'document', rows[0].id, { tracking_number: rows[0].tracking_number, title: rows[0].title })
  } catch (err) { next(err) }
})

// GET /by-tracking/:trackingNumber
router.get('/by-tracking/:trackingNumber', authenticate, async (req, res, next) => {
  try {
    const { trackingNumber } = req.params
    const docResult = await pool.query('SELECT ' + DOC_SELECT_FULL + DOC_JOINS_FULL + ' WHERE UPPER(d.tracking_number) = UPPER($1)', [trackingNumber])
    if (!docResult.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    const doc = formatDoc(docResult.rows[0])
    const docId = docResult.rows[0].id
    const attResult = await pool.query(
      'SELECT a.id, a.original_name, a.filename, a.mime_type, a.file_size_bytes, a.uploaded_by, u.full_name AS uploader_full_name, a.uploaded_at' +
      ' FROM attachments a JOIN users u ON u.id = a.uploaded_by WHERE a.document_id = $1 ORDER BY a.uploaded_at ASC', [docId])
    const logResult = await pool.query(
      'SELECT tl.id, tl.event_type, tl.remarks, tl.metadata, tl.created_at, tl.user_id, u.full_name AS user_full_name, tl.department_id, dept.code AS dept_code, dept.name AS dept_name' +
      ' FROM tracking_log tl JOIN users u ON u.id = tl.user_id JOIN departments dept ON dept.id = tl.department_id WHERE tl.document_id = $1 ORDER BY tl.created_at ASC', [docId])
    doc.attachments = attResult.rows.map(a => ({ id: a.id, original_name: a.original_name, filename: a.filename, mime_type: a.mime_type, file_size_bytes: a.file_size_bytes, uploaded_by: { id: a.uploaded_by, full_name: a.uploader_full_name }, uploaded_at: a.uploaded_at }))
    doc.tracking_log = logResult.rows.map(l => ({ id: l.id, event_type: l.event_type, remarks: l.remarks, metadata: l.metadata, created_at: l.created_at, user: { id: l.user_id, full_name: l.user_full_name }, department: { id: l.department_id, code: l.dept_code, name: l.dept_name } }))
    res.json(doc)
  } catch (err) { next(err) }
})

// GET / -- list documents
router.get('/', authenticate, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25))
    const offset = (page - 1) * limit
    const params = []
    const whereClauses = []
    const scope = buildScopeClause(req.user, params.length + 1)
    if (scope.params.length) params.push(...scope.params)
    whereClauses.push(scope.clause)
    if (req.query.search) {
      const sv = '%' + req.query.search + '%'
      params.push(sv)
      const sp = '$' + params.length
      whereClauses.push('(d.tracking_number ILIKE ' + sp + ' OR d.title ILIKE ' + sp + ' OR dc.name ILIKE ' + sp + ' OR od.name ILIKE ' + sp + ' OR od.code ILIKE ' + sp + ')')
    }
    if (req.query.status)        { params.push(req.query.status);        whereClauses.push('d.status = $' + params.length) }
    if (req.query.department_id) { params.push(req.query.department_id); whereClauses.push('d.current_department_id = $' + params.length) }
    if (req.query.deadline_from) { params.push(req.query.deadline_from); whereClauses.push('d.deadline >= $' + params.length) }
    if (req.query.deadline_to)   { params.push(req.query.deadline_to);   whereClauses.push('d.deadline <= $' + params.length) }
    if (req.query.priority)      { params.push(req.query.priority);      whereClauses.push('d.priority = $' + params.length) }
    if (req.query.category_id)   { params.push(req.query.category_id);   whereClauses.push('d.category_id = $' + params.length) }
    const whereSQL = whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : ''
    const countResult = await pool.query('SELECT COUNT(*) AS total' + DOC_JOINS_FULL + whereSQL, params)
    const total = parseInt(countResult.rows[0].total)
    params.push(limit, offset)
    const limitIdx = params.length - 1
    const offsetIdx = params.length
    const dataResult = await pool.query('SELECT ' + DOC_SELECT_FULL + DOC_JOINS_FULL + whereSQL + ' ORDER BY d.created_at DESC LIMIT $' + limitIdx + ' OFFSET $' + offsetIdx, params)
    res.json({ data: dataResult.rows.map(formatDoc), total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (err) { next(err) }
})

// GET /:id/qr-cover
router.get('/:id/qr-cover', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      'SELECT d.id, d.tracking_number, d.title, d.status, d.created_at, od.name AS originating_department_name' +
      ' FROM documents d JOIN departments od ON od.id = d.originating_department_id WHERE d.id = $1', [id])
    if (!result.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    const doc = result.rows[0]
    const qrDataUrl = await generateQRCode(doc.tracking_number)
    const createdAt = new Date(doc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cover Sheet - ' + doc.tracking_number + '</title>' +
      '<style>body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px}' +
      '@media print{body{margin:0}}.header{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:16px;margin-bottom:24px}' +
      '.field{margin-bottom:12px}.label{font-weight:bold;color:#374151;font-size:14px}.value{font-size:16px;color:#111827;margin-top:2px}' +
      '.qr{text-align:center;margin-top:32px}.qr img{width:200px;height:200px}.qr-caption{margin-top:8px;font-size:12px;color:#6b7280}</style></head><body>' +
      '<div class="header"><h1 style="color:#1d4ed8;margin:0">NONECO Document Tracking System</h1></div>' +
      '<div class="field"><div class="label">Title</div><div class="value">' + doc.title + '</div></div>' +
      '<div class="field"><div class="label">Tracking Number</div><div class="value">' + doc.tracking_number + '</div></div>' +
      '<div class="field"><div class="label">Originating Department</div><div class="value">' + doc.originating_department_name + '</div></div>' +
      '<div class="field"><div class="label">Created</div><div class="value">' + createdAt + '</div></div>' +
      '<div class="field"><div class="label">Status</div><div class="value">' + doc.status + '</div></div>' +
      '<div class="qr"><img src="' + qrDataUrl + '" alt="QR Code"/><div class="qr-caption">Scan to view digital record</div></div>' +
      '</body></html>'
    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  } catch (err) { next(err) }
})

// POST /bulk-complete
router.post('/bulk-complete', authenticate, async (req, res, next) => {
  const { role } = req.user
  if (role !== 'department_head' && role !== 'admin')
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } })
  const { document_ids } = req.body
  if (!Array.isArray(document_ids) || document_ids.length === 0)
    return res.status(400).json({ error: { code: 'BULK_EMPTY', message: 'document_ids must be a non-empty array.' } })
  if (document_ids.length > 100)
    return res.status(400).json({ error: { code: 'BULK_LIMIT_EXCEEDED', message: 'document_ids must not exceed 100 items.' } })
  const client = await pool.connect()
  let completed = 0, skipped = 0
  try {
    await client.query('BEGIN')
    for (const docId of document_ids) {
      const result = await client.query('SELECT id, status FROM documents WHERE id = $1', [docId])
      if (!result.rows.length || result.rows[0].status === 'completed') { skipped++; continue }
      await client.query("UPDATE documents SET status = 'completed', updated_at = NOW() WHERE id = $1", [docId])
      await client.query("INSERT INTO tracking_log (document_id, user_id, department_id, event_type) VALUES ($1, $2, $3, 'completed')", [docId, req.user.id, req.user.departmentId])
      completed++
    }
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK'); client.release(); return next(err) }
  client.release()
  res.json({ completed, skipped })
})

// POST /bulk-set-priority
router.post('/bulk-set-priority', authenticate, async (req, res, next) => {
  const { role } = req.user
  if (role !== 'department_head' && role !== 'admin')
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } })
  const { document_ids, priority } = req.body
  if (!Array.isArray(document_ids) || document_ids.length === 0)
    return res.status(400).json({ error: { code: 'BULK_EMPTY', message: 'document_ids must be a non-empty array.' } })
  if (document_ids.length > 100)
    return res.status(400).json({ error: { code: 'BULK_LIMIT_EXCEEDED', message: 'document_ids must not exceed 100 items.' } })
  const normPri = priority ? priority.toLowerCase() : ''
  if (!VALID_PRIORITIES.includes(normPri))
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'priority must be one of: ' + VALID_PRIORITIES.join(', ') + '.' } })
  try {
    const placeholders = document_ids.map((_, i) => '$' + (i + 2)).join(', ')
    const result = await pool.query('UPDATE documents SET priority = $1, updated_at = NOW() WHERE id IN (' + placeholders + ')', [normPri, ...document_ids])
    res.json({ updated: result.rowCount })
  } catch (err) { next(err) }
})

// GET /quick-search
router.get('/quick-search', authenticate, async (req, res, next) => {
  const q = req.query.q
  if (!q || typeof q !== 'string' || q.trim().length < 2)
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'q must be at least 2 characters.' } })
  try {
    const term = q.trim()
    const scope = buildScopeClause(req.user, 2)
    const params = [term, ...scope.params]
    const result = await pool.query(
      'SELECT ' + DOC_SELECT_FULL + DOC_JOINS_FULL +
      " WHERE (d.tracking_number ILIKE $1 || '%' OR d.title ILIKE '%' || $1 || '%') AND " + scope.clause + ' LIMIT 8', params)
    res.json({ data: result.rows.map(formatDoc) })
  } catch (err) { next(err) }
})

// GET /:id -- full document detail
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params
    const scope = buildScopeClause(req.user, 2)
    const docResult = await pool.query('SELECT ' + DOC_SELECT_FULL + DOC_JOINS_FULL + ' WHERE d.id = $1 AND ' + scope.clause, [id, ...scope.params])
    if (!docResult.rows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    const doc = formatDoc(docResult.rows[0])
    const attResult = await pool.query(
      'SELECT a.id, a.original_name, a.filename, a.mime_type, a.file_size_bytes, a.uploaded_by, u.full_name AS uploader_full_name, a.uploaded_at' +
      ' FROM attachments a JOIN users u ON u.id = a.uploaded_by WHERE a.document_id = $1 ORDER BY a.uploaded_at ASC', [id])
    const logResult = await pool.query(
      'SELECT tl.id, tl.event_type, tl.remarks, tl.metadata, tl.created_at, tl.user_id, u.full_name AS user_full_name, tl.department_id, dept.code AS dept_code, dept.name AS dept_name' +
      ' FROM tracking_log tl JOIN users u ON u.id = tl.user_id JOIN departments dept ON dept.id = tl.department_id WHERE tl.document_id = $1 ORDER BY tl.created_at ASC', [id])
    doc.attachments = attResult.rows.map(a => ({ id: a.id, original_name: a.original_name, filename: a.filename, mime_type: a.mime_type, file_size_bytes: a.file_size_bytes, uploaded_by: { id: a.uploaded_by, full_name: a.uploader_full_name }, uploaded_at: a.uploaded_at }))
    doc.tracking_log = logResult.rows.map(l => ({ id: l.id, event_type: l.event_type, remarks: l.remarks, metadata: l.metadata, created_at: l.created_at, user: { id: l.user_id, full_name: l.user_full_name }, department: { id: l.department_id, code: l.dept_code, name: l.dept_name } }))
    res.json(doc)
  } catch (err) { next(err) }
})

// DELETE /:id -- delete document and all child records (admin only)
router.delete('/:id', authenticate, async (req, res, next) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can delete documents.' } })
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const check = await client.query('SELECT id, tracking_number, title FROM documents WHERE id = $1', [id])
    if (!check.rows.length) {
      await client.query('ROLLBACK'); client.release()
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }
    const { tracking_number, title } = check.rows[0]
    await client.query('DELETE FROM document_comments WHERE document_id = $1', [id])
    await client.query('DELETE FROM notifications WHERE document_id = $1', [id])
    await client.query('DELETE FROM attachments WHERE document_id = $1', [id])
    await client.query('DELETE FROM tracking_log WHERE document_id = $1', [id])
    await client.query('DELETE FROM routing_cc WHERE routing_id IN (SELECT id FROM routings WHERE document_id = $1)', [id])
    await client.query('DELETE FROM routings WHERE document_id = $1', [id])
    await client.query('DELETE FROM documents WHERE id = $1', [id])
    await client.query('COMMIT')
    client.release()
    recordAudit(pool, req.user.id, 'document.deleted', 'document', id, { tracking_number, title })
    res.status(204).end()
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
    next(err)
  }
})

// PATCH /:id -- update document fields
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params
    const { title, description, deadline, priority, category_id, originating_department_id } = req.body

    const scope = buildScopeClause(req.user, 2)
    const checkResult = await pool.query(
      'SELECT d.id, d.status FROM documents d' + DOC_JOINS_FULL.replace(' FROM documents d', '') + ' WHERE d.id = $1 AND ' + scope.clause,
      [id, ...scope.params])
    if (!checkResult.rows.length)
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    if (checkResult.rows[0].status === 'completed')
      return res.status(403).json({ error: { code: 'DOCUMENT_COMPLETED', message: 'Cannot modify a completed document.' } })

    if (category_id !== undefined) {
      const catResult = await pool.query('SELECT id FROM document_categories WHERE id = $1 AND is_active = true', [category_id])
      if (!catResult.rows.length)
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'category_id is invalid or inactive.' } })
    }
    if (originating_department_id !== undefined) {
      const deptResult = await pool.query('SELECT id FROM departments WHERE id = $1', [originating_department_id])
      if (!deptResult.rows.length)
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'originating_department_id does not exist.' } })
    }

    const normPri = priority !== undefined ? priority.toLowerCase() : undefined
    if (normPri !== undefined && !VALID_PRIORITIES.includes(normPri))
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'priority must be one of: ' + VALID_PRIORITIES.join(', ') + '.' } })

    const setCols = []
    const values = []

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim())
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'title must be a non-empty string.' } })
      values.push(title.trim()); setCols.push('title = $' + values.length)
    }
    if (description !== undefined)              { values.push(description || null);          setCols.push('description = $' + values.length) }
    if (deadline !== undefined)                 { values.push(deadline || null);              setCols.push('deadline = $' + values.length) }
    if (normPri !== undefined)                  { values.push(normPri);                       setCols.push('priority = $' + values.length) }
    if (category_id !== undefined)              { values.push(category_id);                   setCols.push('category_id = $' + values.length) }
    if (originating_department_id !== undefined){ values.push(originating_department_id);     setCols.push('originating_department_id = $' + values.length) }

    if (setCols.length === 0)
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No updatable fields provided.' } })

    setCols.push('updated_at = NOW()')
    values.push(id)
    const whereParam = '$' + values.length

    const updateResult = await pool.query(
      'UPDATE documents SET ' + setCols.join(', ') + ' WHERE id = ' + whereParam + ' RETURNING id', values)
    if (!updateResult.rows.length)
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })

    const docResult = await pool.query('SELECT ' + DOC_SELECT_FULL + DOC_JOINS_FULL + ' WHERE d.id = $1', [id])
    res.json(formatDoc(docResult.rows[0]))
  } catch (err) { next(err) }
})

export default router