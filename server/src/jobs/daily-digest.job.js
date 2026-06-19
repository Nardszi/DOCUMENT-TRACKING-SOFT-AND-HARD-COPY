import cron from 'node-cron'
import pool from '../db/pool.js'
import { isEmailEnabled } from '../services/email.service.js'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'

function emailWrapper(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1c1917,#292524);padding:24px 32px;">
            <p style="margin:0;font-size:11px;font-weight:bold;color:#f59e0b;letter-spacing:0.15em;text-transform:uppercase;">NONECO</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#ffffff;">${title}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#a8a29e;">Document Tracking System &mdash; Daily Digest</p>
          </td>
        </tr>
        <tr><td style="padding:28px 32px;">${bodyHtml}</td></tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">Northern Negros Electric Cooperative, Inc. &mdash; Document Tracking System</p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">This is an automated daily digest. Do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function docListTable(rows) {
  if (!rows.length) return '<p style="font-size:13px;color:#9ca3af;margin:0;">No items.</p>'
  const cells = rows.map(r =>
    `<tr>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;font-family:monospace;">${r.tracking_number}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${r.title}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${r.current_dept || '—'}</td>
      <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #f3f4f6;">
        <span style="padding:2px 8px;border-radius:4px;font-weight:bold;${r.status === 'overdue' ? 'background:#fef2f2;color:#991b1b;' : r.status === 'completed' ? 'background:#f0fdf4;color:#166534;' : 'background:#eff6ff;color:#1e40af;'}">${r.status}</span>
      </td>
    </tr>`
  ).join('')
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:8px 0 16px;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:8px 12px;font-size:11px;font-weight:bold;color:#6b7280;text-align:left;">Tracking #</th>
        <th style="padding:8px 12px;font-size:11px;font-weight:bold;color:#6b7280;text-align:left;">Title</th>
        <th style="padding:8px 12px;font-size:11px;font-weight:bold;color:#6b7280;text-align:left;">Dept</th>
        <th style="padding:8px 12px;font-size:11px;font-weight:bold;color:#6b7280;text-align:left;">Status</th>
      </tr></thead>
      <tbody>${cells}</tbody>
    </table>`
}

async function sendDigestToDepartmentHead(user, deptId, deptName, transporter) {
  const statsRes = await pool.query(
    `SELECT status, COUNT(*)::int AS cnt
     FROM documents
     WHERE current_department_id = $1 AND is_archived = FALSE
     GROUP BY status`,
    [deptId]
  )
  const stats = {}
  for (const r of statsRes.rows) stats[r.status] = r.cnt

  const overdueRes = await pool.query(
    `SELECT d.tracking_number, d.title, d.status
     FROM documents d
     WHERE d.current_department_id = $1
       AND d.deadline < CURRENT_DATE
       AND d.status != 'completed'
       AND d.is_archived = FALSE
     ORDER BY d.deadline ASC
     LIMIT 5`,
    [deptId]
  )

  const pendingRes = await pool.query(
    `SELECT d.tracking_number, d.title, 'pending' AS status
     FROM documents d
     WHERE d.current_department_id = $1
       AND d.status IN ('pending', 'forwarded')
       AND d.is_archived = FALSE
       AND d.deadline IS NOT NULL
       AND d.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
     ORDER BY d.deadline ASC
     LIMIT 5`,
    [deptId]
  )

  const totalDocs = Object.values(stats).reduce((a, b) => a + b, 0)
  const overdueCount = overdueRes.rows.length

  const body = `
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">Here is your daily summary for <strong>${deptName}</strong>.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="text-align:center;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
          <p style="margin:0;font-size:24px;font-weight:bold;color:#111827;">${totalDocs}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:bold;">Total Active</p>
        </td>
        <td style="width:8px;"></td>
        <td style="text-align:center;padding:12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;">
          <p style="margin:0;font-size:24px;font-weight:bold;color:#991b1b;">${stats.forwarded || 0}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#991b1b;text-transform:uppercase;font-weight:bold;">Forwarded</p>
        </td>
        <td style="width:8px;"></td>
        <td style="text-align:center;padding:12px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
          <p style="margin:0;font-size:24px;font-weight:bold;color:#92400e;">${overdueCount}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#92400e;text-transform:uppercase;font-weight:bold;">Overdue</p>
        </td>
        <td style="width:8px;"></td>
        <td style="text-align:center;padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
          <p style="margin:0;font-size:24px;font-weight:bold;color:#166534;">${stats.completed || 0}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#166534;text-transform:uppercase;font-weight:bold;">Completed</p>
        </td>
      </tr>
    </table>`

  let alertSection = ''
  if (overdueCount > 0) {
    alertSection += `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
        <p style="margin:0;font-size:14px;font-weight:bold;color:#991b1b;">🔴 Overdue Documents (${overdueCount})</p>
      </div>
      ${docListTable(overdueRes.rows.map(r => ({ ...r, current_dept: deptName })))}`
  }

  if (pendingRes.rows.length > 0) {
    alertSection += `
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
        <p style="margin:0;font-size:14px;font-weight:bold;color:#92400e;">⚠️ Deadline in 3 Days (${pendingRes.rows.length})</p>
      </div>
      ${docListTable(pendingRes.rows.map(r => ({ ...r, current_dept: deptName })))}`
  }

  const fullBody = body + (alertSection || '<p style="font-size:13px;color:#6b7280;">No urgent items today.</p>')
  const url = `${APP_URL}/documents`

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'NONECO DTS <noreply@noneco.coop>',
    to: user.email,
    subject: `[NONECO DTS] Daily Digest — ${deptName}`,
    html: emailWrapper('Daily Document Summary', fullBody + `
      <p style="margin:20px 0 0;text-align:center;">
        <a href="${url}" style="display:inline-block;background:#f59e0b;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;">View Documents</a>
      </p>
    `),
  })
}

async function runDailyDigest() {
  const emailEnabled = await isEmailEnabled()
  if (!emailEnabled) {
    console.log('[daily-digest.job] Email disabled, skipping.')
    return
  }

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  })

  if (!process.env.SMTP_HOST) {
    console.log('[daily-digest.job] SMTP not configured, skipping.')
    return
  }

  const { rows: heads } = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.department_id, d.name AS dept_name, d.code AS dept_code
     FROM users u JOIN departments d ON d.id = u.department_id
     WHERE u.role = 'department_head' AND u.is_active = TRUE AND u.email IS NOT NULL`
  )

  let sent = 0
  for (const head of heads) {
    try {
      await sendDigestToDepartmentHead(head, head.department_id, head.dept_name, transporter)
      sent++
    } catch (err) {
      console.warn(`[daily-digest.job] Failed to send to ${head.email}:`, err.message)
    }
  }

  console.log(`[daily-digest.job] Sent digest to ${sent}/${heads.length} department head(s).`)
}

export function startDailyDigestJob() {
  cron.schedule('0 7 * * 1-5', async () => {
    console.log('[daily-digest.job] Running daily digest...')
    try {
      await runDailyDigest()
      console.log('[daily-digest.job] Done.')
    } catch (err) {
      console.error('[daily-digest.job] Error:', err.message)
    }
  })
  console.log('[daily-digest.job] Scheduled (weekdays at 7 AM).')
}
