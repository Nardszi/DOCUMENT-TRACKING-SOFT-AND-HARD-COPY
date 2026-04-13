/**
 * Audit logging utility.
 * Errors are swallowed so audit recording never breaks the main request flow.
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {string} action
 * @param {string|null} targetType
 * @param {string|null} targetId
 * @param {object|null} details
 */
export async function recordAudit(pool, userId, action, targetType, targetId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, targetType ?? null, targetId ?? null, details ? JSON.stringify(details) : null]
    )
  } catch (err) {
    console.error('audit log error:', err)
  }
}
