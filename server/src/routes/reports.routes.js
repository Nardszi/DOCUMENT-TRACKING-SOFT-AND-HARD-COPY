import { Router } from 'express'
import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'
import pool from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { requireHeadOrAdmin } from '../middleware/rbac.js'

const router = Router()

const VALID_REPORT_TYPES = ['document_volume', 'overdue_documents', 'average_resolution_time', 'user_activity']
const VALID_FORMATS = ['pdf', 'xlsx']

function buildQuery(reportType, filters) {
  const { date_from, date_to, department_id, status, category_id, priority } = filters
  const params = []
  const add = (val) => { params.push(val); return `$${params.length}` }

  if (reportType === 'document_volume') {
    const conds = []
    if (date_from) conds.push(`doc.created_at >= ${add(date_from)}`)
    if (date_to) conds.push(`doc.created_at <= ${add(date_to)}`)
    if (department_id) conds.push(`doc.originating_department_id = ${add(department_id)}`)
    if (status) conds.push(`doc.status = ${add(status)}`)
    if (category_id) conds.push(`doc.category_id = ${add(category_id)}`)
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    return { text: `SELECT d.name AS department, COUNT(*) AS count FROM documents doc JOIN departments d ON d.id = doc.originating_department_id ${where} GROUP BY d.name ORDER BY count DESC`, values: params }
  }

  if (reportType === 'overdue_documents') {
    const conds = [`doc.deadline < CURRENT_DATE`, `doc.status != 'completed'`]
    if (department_id) conds.push(`doc.current_department_id = ${add(department_id)}`)
    if (priority) conds.push(`doc.priority = ${add(priority)}`)
    return { text: `SELECT doc.tracking_number, doc.title, d.name AS department, doc.deadline, doc.priority, doc.status FROM documents doc JOIN departments d ON d.id = doc.current_department_id WHERE ${conds.join(' AND ')} ORDER BY doc.deadline ASC`, values: params }
  }

  if (reportType === 'average_resolution_time') {
    const conds = [`doc.status = 'completed'`]
    if (date_from) conds.push(`doc.created_at >= ${add(date_from)}`)
    if (date_to) conds.push(`doc.created_at <= ${add(date_to)}`)
    if (department_id) conds.push(`doc.originating_department_id = ${add(department_id)}`)
    return { text: `SELECT d.name AS department, ROUND(AVG(EXTRACT(EPOCH FROM (doc.updated_at - doc.created_at)) / 86400), 1) AS avg_days, COUNT(*) AS completed_count FROM documents doc JOIN departments d ON d.id = doc.originating_department_id WHERE ${conds.join(' AND ')} GROUP BY d.name ORDER BY avg_days ASC`, values: params }
  }

  if (reportType === 'user_activity') {
    const joinConds = []
    if (date_from) joinConds.push(`tl.created_at >= ${add(date_from)}`)
    if (date_to) joinConds.push(`tl.created_at <= ${add(date_to)}`)
    const whereConds = [`u.is_active = TRUE`]
    if (department_id) whereConds.push(`u.department_id = ${add(department_id)}`)
    const joinExtra = joinConds.length ? ` AND ${joinConds.join(' AND ')}` : ''
    return { text: `SELECT u.full_name, d.name AS department, COUNT(DISTINCT tl.id) FILTER (WHERE tl.event_type = 'action_recorded') AS actions, COUNT(DISTINCT tl.id) FILTER (WHERE tl.event_type IN ('forwarded','returned')) AS routings, COUNT(DISTINCT tl.id) FILTER (WHERE tl.event_type = 'created') AS documents_created FROM users u JOIN departments d ON d.id = u.department_id LEFT JOIN tracking_log tl ON tl.user_id = u.id${joinExtra} WHERE ${whereConds.join(' AND ')} GROUP BY u.full_name, d.name ORDER BY u.full_name`, values: params }
  }

  throw new Error(`Unknown report type: ${reportType}`)
}

function formatTitle(type) {
  return { document_volume: 'Document Volume Report', overdue_documents: 'Overdue Documents Report', average_resolution_time: 'Average Resolution Time Report', user_activity: 'User Activity Report' }[type] || type
}

function formatHeader(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function generatePDF(res, reportType, rows, filename) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  doc.pipe(res)
  doc.fontSize(16).font('Helvetica-Bold').text(formatTitle(reportType), { align: 'center' })
  doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' })
  doc.moveDown(1.5)
  if (!rows.length) { doc.fontSize(11).text('No data found for the selected filters.'); doc.end(); return }
  const headers = Object.keys(rows[0])
  const colWidth = Math.min(150, (doc.page.width - 80) / headers.length)
  const startX = 40
  doc.fontSize(9).font('Helvetica-Bold')
  headers.forEach((h, i) => { doc.text(formatHeader(h), startX + i * colWidth, doc.y, { width: colWidth, continued: i < headers.length - 1 }) })
  doc.moveDown(0.3)
  doc.moveTo(startX, doc.y).lineTo(startX + headers.length * colWidth, doc.y).stroke()
  doc.moveDown(0.3)
  doc.font('Helvetica').fontSize(8)
  rows.forEach((row) => {
    if (doc.y > doc.page.height - 80) doc.addPage()
    const vals = headers.map((h) => String(row[h] ?? ''))
    vals.forEach((v, i) => { doc.text(v, startX + i * colWidth, doc.y, { width: colWidth, continued: i < vals.length - 1 }) })
    doc.moveDown(0.2)
  })
  doc.end()
}

async function generateXLSX(res, reportType, rows, filename) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'NONECO Document Tracking'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(formatTitle(reportType))
  if (rows.length) {
    const headers = Object.keys(rows[0])
    sheet.addRow(headers.map(formatHeader))
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).commit()
    rows.forEach((row) => sheet.addRow(headers.map((h) => row[h] ?? '')))
    headers.forEach((_, i) => {
      const col = sheet.getColumn(i + 1)
      let maxLen = headers[i].length
      sheet.eachRow((row) => { const len = String(row.getCell(i + 1).value ?? '').length; if (len > maxLen) maxLen = len })
      col.width = Math.min(maxLen + 2, 40)
    })
  } else {
    sheet.addRow(['No data found for the selected filters.'])
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
  res.end()
}

// POST /generate
router.post('/generate', authenticate, requireHeadOrAdmin, async (req, res, next) => {
  try {
    const { report_type, format, date_from, date_to, department_id, status, category_id, priority } = req.body
    if (!report_type || !VALID_REPORT_TYPES.includes(report_type)) {
      return res.status(400).json({ error: { code: 'INVALID_REPORT_TYPE', message: `report_type must be one of: ${VALID_REPORT_TYPES.join(', ')}` } })
    }
    const fmt = (format || 'pdf').toLowerCase()
    if (!VALID_FORMATS.includes(fmt)) {
      return res.status(400).json({ error: { code: 'INVALID_FORMAT', message: `format must be one of: ${VALID_FORMATS.join(', ')}` } })
    }
    const query = buildQuery(report_type, { date_from, date_to, department_id, status, category_id, priority })
    const { rows } = await pool.query(query)
    const dateStr = new Date().toISOString().slice(0, 10)
    const ext = fmt === 'xlsx' ? 'xlsx' : 'pdf'
    const filename = `report-${report_type}-${dateStr}.${ext}`
    if (fmt === 'xlsx') {
      await generateXLSX(res, report_type, rows, filename)
    } else {
      generatePDF(res, report_type, rows, filename)
    }
  } catch (err) {
    next(err)
  }
})

// GET /:id/download
router.get('/:id/download', authenticate, requireHeadOrAdmin, (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reports are generated on-demand. Please use POST /generate.' } })
})

export default router
