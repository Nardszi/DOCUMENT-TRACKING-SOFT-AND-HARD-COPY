// Role-Permission Map:
// staff           → create documents, view scoped documents, upload attachments, record actions, forward/return
// department_head → all staff permissions + mark complete, set deadlines, generate reports
// admin           → all permissions + user management, category management, system settings, all reports

const ROLE_HIERARCHY = ['staff', 'department_head', 'admin']

/**
 * Middleware factory: returns Express middleware that checks req.user.role
 * against the provided allowed roles. Requires authenticate middleware to run first.
 *
 * @param {...string} allowedRoles - Roles permitted to access the route
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } })
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } })
    }
    next()
  }
}

export const requireAdmin = requireRole('admin')
export const requireHeadOrAdmin = requireRole('department_head', 'admin')
