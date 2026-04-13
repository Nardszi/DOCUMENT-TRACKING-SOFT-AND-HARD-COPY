import nodemailer from 'nodemailer'
import pool from '../db/pool.js'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@noneco.coop'

const EVENT_TYPE_LABELS = {
  document_forwarded: 'Document Forwarded',
  document_returned: 'Document Returned',
  deadline_approaching: 'Deadline Approaching',
  deadline_passed: 'Deadline Passed',
  document_urgent: 'Document Marked Urgent',
}

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
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  })
}

export async function sendNotificationEmail(userEmail, subject, { documentTitle, trackingNumber, status, eventType }) {
  const transporter = createTransporter()
  if (!transporter) {
    console.warn('[email] SMTP_HOST not configured — skipping email notification')
    return
  }
  const docUrl = `${APP_URL}/documents/${trackingNumber}`
  const eventLabel = EVENT_TYPE_LABELS[eventType] || eventType
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a56db;">NONECO Document Tracking System</h2>
      <p>You have a new notification regarding a document.</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6;width:40%;">Event</td><td style="padding:8px;">${eventLabel}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6;">Document Title</td><td style="padding:8px;">${documentTitle}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6;">Tracking Number</td><td style="padding:8px;">${trackingNumber}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;background:#f3f4f6;">Current Status</td><td style="padding:8px;">${status}</td></tr>
      </table>
      <p><a href="${docUrl}" style="background:#1a56db;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">View Document</a></p>
      <p style="color:#6b7280;font-size:12px;">Or copy this link: <a href="${docUrl}">${docUrl}</a></p>
    </div>
  `
  await transporter.sendMail({ from: SMTP_FROM, to: userEmail, subject, html })
}
