import { Router } from 'express'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

function buildScopeClause(user, startIdx) {
  if (user.role === 'admin') return { clause: 'TRUE', params: [] }
  const deptId = user.departmentId
  const params = [deptId]
  const p = `$${startIdx}`
  const clause =
    '(' +
    `d.current_department_id = ${p}` +
    ' OR EXISTS (SELECT 1 FROM routings r WHERE r.document_id = d.id AND (r.from_department_id = ' + p + ' OR r.to_department_id = ' + p + '))' +
    ' OR EXISTS (SELECT 1 FROM routing_cc rcc JOIN routings r2 ON r2.id = rcc.routing_id WHERE r2.document_id = d.id AND rcc.department_id = ' + p + ')' +
    ')'
  return { clause, params }
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const scope = buildScopeClause(req.user, 1)
    const scopeWhere = 'WHERE ' + scope.clause
    const scopeParams = scope.params

    // Summary counts
    const countsResult = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE d.status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE d.status = 'in_progress') AS in_progress,
         COUNT(*) FILTER (WHERE d.status = 'forwarded') AS forwarded,
         COUNT(*) FILTER (WHERE d.status = 'returned') AS returned,
         COUNT(*) FILTER (WHERE d.status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE d.deadline IS NOT NULL AND d.deadline < CURRENT_DATE AND d.status != 'completed') AS overdue
       FROM documents d ${scopeWhere}`,
      scopeParams
    )
    const row = countsResult.rows[0]
    const counts = {
      total: parseInt(row.total), pending: parseInt(row.pending),
      in_progress: parseInt(row.in_progress), forwarded: parseInt(row.forwarded),
      returned: parseInt(row.returned), overdue: parseInt(row.overdue), completed: parseInt(row.completed),
    }

    // Recently updated (last 10)
    const recentResult = await pool.query(
      `SELECT d.id, d.tracking_number, d.title, d.status, d.priority,
              d.current_department_id, cd.code AS dept_code, cd.name AS dept_name, d.updated_at
       FROM documents d JOIN departments cd ON cd.id = d.current_department_id
       ${scopeWhere} ORDER BY d.updated_at DESC LIMIT 10`,
      scopeParams
    )
    const recently_updated = recentResult.rows.map((r) => ({
      id: r.id, tracking_number: r.tracking_number, title: r.title,
      status: r.status, priority: r.priority,
      current_department: { id: r.current_department_id, code: r.dept_code, name: r.dept_name },
      updated_at: r.updated_at,
    }))

    // Approaching deadlines (next 7 days)
    const deadlineResult = await pool.query(
      `SELECT d.id, d.tracking_number, d.title, d.status, d.priority, d.deadline,
              d.current_department_id, cd.code AS dept_code, cd.name AS dept_name, d.updated_at
       FROM documents d JOIN departments cd ON cd.id = d.current_department_id
       ${scopeWhere} AND d.deadline IS NOT NULL AND d.deadline >= CURRENT_DATE
         AND d.deadline <= CURRENT_DATE + INTERVAL '7 days' AND d.status != 'completed'
       ORDER BY d.deadline ASC`,
      scopeParams
    )
    const approaching_deadlines = deadlineResult.rows.map((r) => ({
      id: r.id, tracking_number: r.tracking_number, title: r.title,
      status: r.status, priority: r.priority, deadline: r.deadline,
      current_department: { id: r.current_department_id, code: r.dept_code, name: r.dept_name },
      updated_at: r.updated_at,
    }))

    // Bottleneck (admin only)
    let bottleneck = null
    if (req.user.role === 'admin') {
      const bResult = await pool.query(
        `SELECT d.current_department_id, dept.code, dept.name, COUNT(*) AS open_count
         FROM documents d JOIN departments dept ON dept.id = d.current_department_id
         WHERE d.status != 'completed'
         GROUP BY d.current_department_id, dept.code, dept.name
         ORDER BY open_count DESC LIMIT 1`
      )
      if (bResult.rows.length) {
        const b = bResult.rows[0]
        bottleneck = { department: { id: b.current_department_id, code: b.code, name: b.name }, open_count: parseInt(b.open_count) }
      }
    }

    res.json({ counts, recently_updated, approaching_deadlines, bottleneck })
  } catch (err) {
    next(err)
  }
})

export default router
