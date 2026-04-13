import { Router } from 'express'
import multer from 'multer'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { getStorageAdapter } from '../services/storage.service.js'

const router = Router()

// ---------------------------------------------------------------------------
// Allowed MIME types (Requirement 10.4, 2.5)
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
])

// ---------------------------------------------------------------------------
// Multer — memory storage, 20 MB limit (Requirement 2.6, 10.1)
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

// ---------------------------------------------------------------------------
// Scope helper (mirrors documents.routes.js logic)
// ---------------------------------------------------------------------------
function buildScopeClause(user, startIdx) {
  if (user.role === 'admin') {
    return { clause: 'TRUE', params: [] }
  }

  const deptId = user.departmentId
  const params = [deptId]
  const p = `$${startIdx}`

  if (user.role === 'department_head') {
    const clause =
      '(' +
      `d.originating_department_id = ${p}` +
      ` OR d.current_department_id = ${p}` +
      ' OR EXISTS (' +
        'SELECT 1 FROM routings r' +
        ' WHERE r.document_id = d.id' +
        ` AND (r.from_department_id = ${p} OR r.to_department_id = ${p})` +
      ')' +
      ' OR EXISTS (' +
        'SELECT 1 FROM routing_cc rcc' +
        ' JOIN routings r2 ON r2.id = rcc.routing_id' +
        ` WHERE r2.document_id = d.id AND rcc.department_id = ${p}` +
      ')' +
      ')'
    return { clause, params }
  }

  // staff
  const clause =
    '(' +
    `d.current_department_id = ${p}` +
    ' OR EXISTS (' +
      'SELECT 1 FROM routings r' +
      ' WHERE r.document_id = d.id' +
      ` AND (r.from_department_id = ${p} OR r.to_department_id = ${p})` +
    ')' +
    ' OR EXISTS (' +
      'SELECT 1 FROM routing_cc rcc' +
      ' JOIN routings r2 ON r2.id = rcc.routing_id' +
      ` WHERE r2.document_id = d.id AND rcc.department_id = ${p}` +
    ')' +
    ')'
  return { clause, params }
}

// ---------------------------------------------------------------------------
// POST /:documentId/attachments — upload attachment (Req 2.5, 2.6, 10.1, 10.4)
// ---------------------------------------------------------------------------
router.post('/:documentId/attachments', authenticate, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 20 MB size limit.' },
        })
      }
      return next(err)
    }
    next()
  })
}, async (req, res, next) => {
  try {
    const { documentId } = req.params

    if (!req.file) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'No file uploaded. Use multipart/form-data with field name "file".' },
      })
    }

    // Validate MIME type (Requirement 10.4)
    if (!ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({
        error: {
          code: 'FILE_TYPE_INVALID',
          message: 'File type not allowed. Accepted types: PDF, DOCX, XLSX, PNG, JPG.',
        },
      })
    }

    // Check document exists and is not completed (Requirement 10.1)
    const docResult = await pool.query(
      'SELECT id, status FROM documents WHERE id = $1',
      [documentId]
    )

    if (!docResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }

    if (docResult.rows[0].status === 'completed') {
      return res.status(403).json({
        error: { code: 'DOCUMENT_COMPLETED', message: 'Cannot upload attachments to a completed document.' },
      })
    }

    // Save file via storage adapter
    const adapter = getStorageAdapter()
    const storagePath = await adapter.save(req.file.buffer, req.file.originalname, req.file.mimetype)

    // Insert attachment record
    const { rows } = await pool.query(
      `INSERT INTO attachments
         (document_id, filename, original_name, mime_type, file_size_bytes, storage_path, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, document_id, filename, original_name, mime_type, file_size_bytes, storage_path, uploaded_by, uploaded_at`,
      [
        documentId,
        storagePath.split('/').pop(), // UUID-based filename portion
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        storagePath,
        req.user.id,
      ]
    )

    const attachment = rows[0]

    res.status(201).json({
      id: attachment.id,
      document_id: attachment.document_id,
      filename: attachment.filename,
      original_name: attachment.original_name,
      mime_type: attachment.mime_type,
      file_size_bytes: attachment.file_size_bytes,
      uploaded_by: req.user.id,
      uploaded_at: attachment.uploaded_at,
    })
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// GET /:documentId/attachments/:attachId — download attachment (Req 10.2)
// ---------------------------------------------------------------------------
router.get('/:documentId/attachments/:attachId', authenticate, async (req, res, next) => {
  try {
    const { documentId, attachId } = req.params

    // Enforce document visibility scoping (Requirement 5)
    const scope = buildScopeClause(req.user, 2)
    const docResult = await pool.query(
      `SELECT d.id FROM documents d WHERE d.id = $1 AND ${scope.clause}`,
      [documentId, ...scope.params]
    )

    if (!docResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } })
    }

    // Fetch attachment record
    const attResult = await pool.query(
      'SELECT id, original_name, mime_type, storage_path FROM attachments WHERE id = $1 AND document_id = $2',
      [attachId, documentId]
    )

    if (!attResult.rows.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment not found.' } })
    }

    const att = attResult.rows[0]

    // Stream file to client
    const adapter = getStorageAdapter()
    const stream = adapter.getStream(att.storage_path)

    res.setHeader('Content-Type', att.mime_type)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(att.original_name)}"`
    )

    stream.on('error', (err) => {
      if (!res.headersSent) {
        next(err)
      }
    })

    stream.pipe(res)
  } catch (err) {
    next(err)
  }
})

export default router
