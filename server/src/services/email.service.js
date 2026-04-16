import nodemailer from 'nodemailer'
import pool from '../db/pool.js'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const SMTP_FROM = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'NONECO DTS <noreply@noneco.coop>'

export async function isEmailEnabled() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'email_notifications_enabled'"
    )
    if (!rows.length) return false
    const val = rows[0].value
    return val === true || val === 'true'
  } catch {
    return false
  }
}

function createTransporter() {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  })
}

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
function emailWrapper(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1c1917,#292524);padding:24px 32px;">
            <p style="margin:0;font-size:11px;font-weight:bold;color:#f59e0b;letter-spacing:0.15em;text-transform:uppercase;">NONECO</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:bold;color:#ffffff;">${title}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#a8a29e;">Document Tracking System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px;">${bodyHtml}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">Northern Negros Electric Cooperative, Inc. &mdash; Document Tracking System</p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">This is an automated notification. Do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function docTable(rows) {
  const cells = rows.map(([label, value]) =>
    `<tr>
      <td style="padding:8px 12px;font-size:12px;font-weight:bold;color:#6b7280;background:#f9fafb;width:38%;border-bottom:1px solid #f3f4f6;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`
  ).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:16px 0;">${cells}</table>`
}

function actionButton(url, label, color = '#f59e0b') {
  return `<p style="margin:20px 0 0;text-align:center;">
    <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold;">${label}</a>
  </p>
  <p style="margin:8px 0 0;text-align:center;font-size:11px;color:#9ca3af;">Or copy: <a href="${url}" style="color:#6b7280;">${url}</a></p>`
}

// ── Email: document forwarded ─────────────────────────────────────────────────
export async function sendForwardedEmail(userEmail, { documentTitle, trackingNumber, status, fromDept, toDept, routingNote, documentId }) {
  const transporter = createTransporter()
  if (!transporter) return
  const url = `${APP_URL}/documents/${documentId}`
  const body = `
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">A document has been forwarded to your department and requires your attention.</p>
    ${docTable([
      ['Document', documentTitle],
      ['Tracking #', `<span style="font-family:monospace;">${trackingNumber}</span>`],
      ['From', fromDept],
      ['To', `<strong>${toDept}</strong>`],
      ['Status', status],
      ['Routing Note', routingNote || '—'],
    ])}
    ${actionButton(url, 'View Document')}
  `
  await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: `[NONECO DTS] Document Forwarded: ${trackingNumber}`,
    html: emailWrapper('Document Forwarded to Your Department', body),
  })
}

// ── Email: document returned ──────────────────────────────────────────────────
export async function sendReturnedEmail(userEmail, { documentTitle, trackingNumber, status, fromDept, reason, documentId }) {
  const transporter = createTransporter()
  if (!transporter) return
  const url = `${APP_URL}/documents/${documentId}`
  const body = `
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">A document has been returned to your department. Please review the reason and take the necessary action.</p>
    ${docTable([
      ['Document', documentTitle],
      ['Tracking #', `<span style="font-family:monospace;">${trackingNumber}</span>`],
      ['Returned By', fromDept],
      ['Status', status],
      ['Reason', `<span style="color:#dc2626;">${reason || '—'}</span>`],
    ])}
    ${actionButton(url, 'View Document', '#f59e0b')}
  `
  await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: `[NONECO DTS] Document Returned: ${trackingNumber}`,
    html: emailWrapper('Document Returned to Your Department', body),
  })
}

// ── Email: deadline approaching ───────────────────────────────────────────────
export async function sendDeadlineApproachingEmail(userEmail, { documentTitle, trackingNumber, deadline, daysLeft, department, documentId }) {
  const transporter = createTransporter()
  if (!transporter) return
  const url = `${APP_URL}/documents/${documentId}`
  const body = `
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:14px;font-weight:bold;color:#92400e;">⚠️ Deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}</p>
    </div>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">The following document is approaching its deadline and requires action.</p>
    ${docTable([
      ['Document', documentTitle],
      ['Tracking #', `<span style="font-family:monospace;">${trackingNumber}</span>`],
      ['Current Department', department],
      ['Deadline', `<strong style="color:#dc2626;">${deadline}</strong>`],
    ])}
    ${actionButton(url, 'View Document', '#d97706')}
  `
  await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: `[NONECO DTS] Deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}: ${trackingNumber}`,
    html: emailWrapper('Document Deadline Approaching', body),
  })
}

// ── Email: deadline passed ────────────────────────────────────────────────────
export async function sendDeadlinePassedEmail(userEmail, { documentTitle, trackingNumber, deadline, department, documentId }) {
  const transporter = createTransporter()
  if (!transporter) return
  const url = `${APP_URL}/documents/${documentId}`
  const body = `
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:14px;font-weight:bold;color:#991b1b;">🔴 Deadline Overdue</p>
    </div>
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">The following document has passed its deadline and is now overdue. Immediate action is required.</p>
    ${docTable([
      ['Document', documentTitle],
      ['Tracking #', `<span style="font-family:monospace;">${trackingNumber}</span>`],
      ['Current Department', department],
      ['Deadline', `<strong style="color:#dc2626;">${deadline}</strong>`],
    ])}
    ${actionButton(url, 'View Document Now', '#dc2626')}
  `
  await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: `[NONECO DTS] OVERDUE: ${trackingNumber}`,
    html: emailWrapper('Document Deadline Passed', body),
  })
}

// ── Email: document recalled ──────────────────────────────────────────────────
export async function sendRecalledEmail(userEmail, { documentTitle, trackingNumber, recalledBy, reason, documentId }) {
  const transporter = createTransporter()
  if (!transporter) return
  const url = `${APP_URL}/documents/${documentId}`
  const body = `
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">A document that was forwarded to your department has been recalled by the originating department.</p>
    ${docTable([
      ['Document', documentTitle],
      ['Tracking #', `<span style="font-family:monospace;">${trackingNumber}</span>`],
      ['Recalled By', recalledBy],
      ['Reason', reason || '—'],
    ])}
    <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">This document has been removed from your department's queue. No further action is required.</p>
    ${actionButton(url, 'View Document', '#7c3aed')}
  `
  await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject: `[NONECO DTS] Document Recalled: ${trackingNumber}`,
    html: emailWrapper('Document Recalled', body),
  })
}

// ── Legacy helper (kept for backward compat) ──────────────────────────────────
export async function sendNotificationEmail(userEmail, subject, { documentTitle, trackingNumber, status, eventType }) {
  const transporter = createTransporter()
  if (!transporter) return
  const url = `${APP_URL}/documents/${trackingNumber}`
  const body = `
    <p style="font-size:14px;color:#374151;margin:0 0 16px;">You have a new notification regarding a document.</p>
    ${docTable([
      ['Event', eventType],
      ['Document', documentTitle],
      ['Tracking #', `<span style="font-family:monospace;">${trackingNumber}</span>`],
      ['Status', status],
    ])}
    ${actionButton(url, 'View Document')}
  `
  await transporter.sendMail({
    from: SMTP_FROM,
    to: userEmail,
    subject,
    html: emailWrapper('Document Notification', body),
  })
}
