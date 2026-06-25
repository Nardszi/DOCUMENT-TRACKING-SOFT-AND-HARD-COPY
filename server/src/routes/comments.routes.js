import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

async function canAccessDocument(userId, userRole, departmentId, documentId) {
  if (userRole === 'admin') return true
  const { rows } = await pool.query(
    `SELECT d.id, d.status, d.current_department_id, d.created_by,
            r.to_department_id AS routed_to_dept
     FROM documents d
     LEFT JOIN routings r ON r.document_id = d.id AND r.created_at = (
       SELECT MAX(r2.created_at) FROM routings r2 WHERE r2.document_id = d.id
     )
     WHERE d.id = $1`,
    [documentId]
  )
  if (!rows.length) return false
  const doc = rows[0]
  if (doc.status === 'forwarded' && String(doc.routed_to_dept) === String(departmentId)) return true
  if (String(doc.current_department_id) === String(departmentId)) return true
  if (String(doc.created_by) === String(userId)) return true
  return false
}

// Helper: format a comment row with user + department
function formatComment(r) {
  return {
    id: r.id,
    content: r.content,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user: {
      id: r.user_id,
      full_name: r.user_full_name,
      department: r.department_name || null,
    },
  }
}

// GET /:documentId/comments
router.get('/:documentId/comments', authenticate, async (req, res, next) => {
  try {
    if (!await canAccessDocument(req.user.id, req.user.role, req.user.departmentId, req.params.documentId))
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } })
    const { rows } = await pool.query(
      `SELECT c.id, c.content, c.created_at, c.updated_at,
              u.id AS user_id, u.full_name AS user_full_name,
              d.name AS department_name
       FROM document_comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE c.document_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.documentId]
    )
    res.json(rows.map(formatComment))
  } catch (err) { next(err) }
})

// POST /:documentId/comments
router.post('/:documentId/comments', authenticate, async (req, res, next) => {
  const { content } = req.body
  if (!content || !content.trim()) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'content is required.' } })
  }
  try {
    if (!await canAccessDocument(req.user.id, req.user.role, req.user.departmentId, req.params.documentId))
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } })
    const { rows } = await pool.query(
      `INSERT INTO document_comments (document_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at, updated_at`,
      [req.params.documentId, req.user.id, content.trim()]
    )
    const comment = rows[0]
    // Fetch department for the response
    const { rows: userRows } = await pool.query(
      `SELECT u.full_name, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = $1`,
      [req.user.id]
    )
    const userInfo = userRows[0] || {}
    res.status(201).json({
      ...comment,
      user: {
        id: req.user.id,
        full_name: userInfo.full_name || req.user.fullName,
        department: userInfo.department_name || null,
      },
    })
  } catch (err) { next(err) }
})

// PATCH /:documentId/comments/:commentId (own comment, within 24h)
router.patch('/:documentId/comments/:commentId', authenticate, async (req, res, next) => {
  const { content } = req.body
  if (!content || !content.trim()) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'content is required.' } })
  }
  try {
    if (!await canAccessDocument(req.user.id, req.user.role, req.user.departmentId, req.params.documentId))
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } })
    // Fetch the comment first
    const { rows } = await pool.query(
      'SELECT id, user_id, created_at FROM document_comments WHERE id = $1 AND document_id = $2',
      [req.params.commentId, req.params.documentId]
    )
    if (!rows.length) {
      return res.status(404).json({ error: { code: 'COMMENT_NOT_FOUND', message: 'Comment not found.' } })
    }
    const comment = rows[0]

    // Check authorship
    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'COMMENT_FORBIDDEN', message: 'You are not the author of this comment.' } })
    }

    // Check 24h window
    const ageMs = Date.now() - new Date(comment.created_at).getTime()
    if (ageMs > 24 * 60 * 60 * 1000) {
      return res.status(403).json({ error: { code: 'COMMENT_EDIT_EXPIRED', message: 'Comments can only be edited within 24 hours of creation.' } })
    }

    // Update
    const { rows: updated } = await pool.query(
      `UPDATE document_comments
       SET content = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, content, created_at, updated_at, user_id`,
      [content.trim(), req.params.commentId]
    )

    // Fetch user + department for response
    const { rows: userRows } = await pool.query(
      `SELECT u.id, u.full_name, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = $1`,
      [req.user.id]
    )
    const userInfo = userRows[0] || {}
    const row = updated[0]
    res.json({
      id: row.id,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user: {
        id: req.user.id,
        full_name: userInfo.full_name || req.user.fullName,
        department: userInfo.department_name || null,
      },
    })
  } catch (err) { next(err) }
})

// DELETE /:documentId/comments/:commentId (own comment or admin)
router.delete('/:documentId/comments/:commentId', authenticate, async (req, res, next) => {
  try {
    if (!await canAccessDocument(req.user.id, req.user.role, req.user.departmentId, req.params.documentId))
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied.' } })
    // Fetch comment to check ownership
    const { rows } = await pool.query(
      'SELECT id, user_id FROM document_comments WHERE id = $1 AND document_id = $2',
      [req.params.commentId, req.params.documentId]
    )
    if (!rows.length) {
      return res.status(404).json({ error: { code: 'COMMENT_NOT_FOUND', message: 'Comment not found.' } })
    }
    const comment = rows[0]

    const isAuthor = comment.user_id === req.user.id
    const isAdmin = req.user.role === 'admin'

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: { code: 'COMMENT_FORBIDDEN', message: 'You do not have permission to delete this comment.' } })
    }

    await pool.query('DELETE FROM document_comments WHERE id = $1', [req.params.commentId])
    res.status(204).send()
  } catch (err) { next(err) }
})

export default router
