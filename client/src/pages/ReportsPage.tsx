import { useState, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiQuery } from '../hooks/useApi'

interface Department { id: string; code: string; name: string }
interface Category { id: string; name: string; is_active: boolean }

const REPORT_TYPES = [
  { value: 'document_volume', label: 'Document Volume', desc: 'Documents per department', icon: 'bar' as const },
  { value: 'overdue_documents', label: 'Overdue', desc: 'Past-deadline documents', icon: 'clock' as const },
  { value: 'average_resolution_time', label: 'Resolution Time', desc: 'Avg days to complete', icon: 'timer' as const },
  { value: 'user_activity', label: 'User Activity', desc: 'Actions per user', icon: 'users' as const },
] as const

type IconType = 'bar' | 'clock' | 'timer' | 'users'

function ReportIcon({ type, className }: { type: IconType; className?: string }) {
  const cls = className ?? 'w-5 h-5'
  if (type === 'bar') return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
  if (type === 'clock') return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  if (type === 'timer') return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
  return <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}

const fieldCls = 'w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 min-h-[40px] dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-colors'

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 px-4 py-3">
      <p className="text-xs text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  )
}

export default function ReportsPage() {
  useDocumentTitle('Reports')
  const { user, token } = useAuth()
  const { data: departments = [] } = useApiQuery<Department[]>('/api/departments', { retry: false })
  const { data: categories = [] } = useApiQuery<Category[]>('/api/categories', { retry: false })
  const [reportType, setReportType] = useState('document_volume')
  const [format, setFormat] = useState('pdf')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState('')
  const [generating, setGenerating] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState('')
  const [previewData, setPreviewData] = useState<{ title: string; rows: Record<string, unknown>[]; generated_at: string } | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  if (user?.role !== 'department_head' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center dark:bg-stone-800 dark:border-stone-700">
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">Access Denied</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">You do not have permission to view this page.</p>
        </div>
      </div>
    )
  }

  async function handlePreview() {
    setError(''); setPreviewData(null); setPreviewing(true)
    try {
      const body: Record<string, string> = { report_type: reportType }
      if (dateFrom) body.date_from = dateFrom
      if (dateTo) body.date_to = dateTo
      if (departmentId) body.department_id = departmentId
      if (status) body.status = status
      if (categoryId) body.category_id = categoryId
      if (priority) body.priority = priority
      const res = await fetch('/api/reports/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error?.message || 'Failed to preview.') }
      setPreviewData(await res.json())
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed.') } finally { setPreviewing(false) }
  }

  async function handleDownload() {
    setError(''); setGenerating(true)
    try {
      const body: Record<string, string> = { report_type: reportType, format }
      if (dateFrom) body.date_from = dateFrom
      if (dateTo) body.date_to = dateTo
      if (departmentId) body.department_id = departmentId
      if (status) body.status = status
      if (categoryId) body.category_id = categoryId
      if (priority) body.priority = priority
      const res = await fetch('/api/reports/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error?.message || 'Failed to generate.') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `report-${reportType}-${new Date().toISOString().slice(0, 10)}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed.') } finally { setGenerating(false) }
  }

  const previewHeaders = useMemo(() => previewData?.rows?.[0] ? Object.keys(previewData.rows[0]) : [], [previewData])

  const summaryStats = useMemo(() => {
    if (!previewData?.rows?.length) return null
    const rows = previewData.rows
    if (reportType === 'document_volume') {
      const total = rows.reduce((s, r) => s + Number(r.count ?? 0), 0)
      const top = rows.length > 0 ? rows.reduce((a, b) => Number(a.count) > Number(b.count) ? a : b) : null
      return { label1: 'Total', val1: total, label2: 'Departments', val2: rows.length, label3: 'Top', val3: String(top?.department ?? '—'), c1: 'text-amber-600 dark:text-amber-400', c2: 'text-sky-600 dark:text-sky-400', c3: 'text-emerald-600 dark:text-emerald-400' }
    }
    if (reportType === 'overdue_documents') {
      const urgent = rows.filter(r => r.priority === 'urgent').length
      return { label1: 'Overdue', val1: rows.length, label2: 'Urgent', val2: urgent, label3: 'Categories', val3: rows.length, c1: 'text-red-600 dark:text-red-400', c2: 'text-orange-600 dark:text-orange-400', c3: 'text-stone-600 dark:text-stone-400' }
    }
    if (reportType === 'average_resolution_time') {
      const avg = rows.length > 0 ? (rows.reduce((s, r) => s + Number(r.avg_days ?? 0), 0) / rows.length).toFixed(1) : '0'
      const best = rows.length > 0 ? rows.reduce((a, b) => Number(a.avg_days) < Number(b.avg_days) ? a : b) : null
      return { label1: 'Avg Days', val1: avg, label2: 'Fastest', val2: String(best?.department ?? '—'), label3: 'Depts', val3: rows.length, c1: 'text-amber-600 dark:text-amber-400', c2: 'text-emerald-600 dark:text-emerald-400', c3: 'text-sky-600 dark:text-sky-400' }
    }
    if (reportType === 'user_activity') {
      const totalActions = rows.reduce((s, r) => s + Number(r.actions ?? 0), 0)
      return { label1: 'Actions', val1: totalActions, label2: 'Users', val2: rows.length, label3: 'Rows', val3: rows.length, c1: 'text-amber-600 dark:text-amber-400', c2: 'text-sky-600 dark:text-sky-400', c3: 'text-stone-600 dark:text-stone-400' }
    }
    return null
  }, [previewData, reportType])

  const selectedType = REPORT_TYPES.find(r => r.value === reportType)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">Reports</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Generate and export document activity reports</p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Left: Config panel */}
          <div className="lg:col-span-2 space-y-4">

            {/* Report type cards */}
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Report Type</h2>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {REPORT_TYPES.map(r => (
                  <button key={r.value} type="button" onClick={() => { setReportType(r.value); setPreviewData(null) }}
                    className={`text-left p-3 rounded-xl border transition-all ${reportType === r.value ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-900/20 dark:border-amber-500' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800'}`}>
                    <ReportIcon type={r.icon} className={`w-4 h-4 mb-1.5 ${reportType === r.value ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400'}`} />
                    <p className={`text-xs font-semibold ${reportType === r.value ? 'text-amber-700 dark:text-amber-400' : 'text-stone-700 dark:text-stone-300'}`}>{r.label}</p>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4">
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Format</label>
              <div className="flex gap-2">
                {[{ value: 'pdf', label: 'PDF' }, { value: 'xlsx', label: 'Excel' }].map(f => (
                  <button key={f.value} type="button" onClick={() => setFormat(f.value)}
                    className={`flex-1 min-h-[36px] rounded-lg border text-xs font-medium transition-all ${format === f.value ? 'border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-400 dark:bg-amber-900/20 dark:text-amber-400' : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-400'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filters toggle */}
            <button type="button" onClick={() => setShowFilters(!showFilters)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">
              <span>Filters {(dateFrom || dateTo || departmentId || status || categoryId || priority) && <span className="ml-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full text-[10px]">Active</span>}</span>
              <svg className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {showFilters && (
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={fieldCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={fieldCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Department</label>
                  <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={fieldCls}>
                    <option value="">All</option>{departments.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className={fieldCls}>
                      <option value="">All</option><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="forwarded">Forwarded</option><option value="returned">Returned</option><option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={fieldCls}>
                      <option value="">All</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Category</label>
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={fieldCls}>
                    <option value="">All</option>{categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button onClick={handlePreview} disabled={previewing}
                className="flex-1 min-h-[40px] rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors">
                {previewing ? 'Loading…' : 'Preview'}
              </button>
              <button onClick={handleDownload} disabled={generating}
                className="flex-1 min-h-[40px] rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                {generating ? 'Generating…' : `Download ${format.toUpperCase()}`}
              </button>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">{selectedType?.label ?? 'Report'}</h2>
                  {previewData && <p className="text-[11px] text-stone-400 dark:text-stone-500">{previewData.rows.length} row{previewData.rows.length !== 1 ? 's' : ''} · {new Date(previewData.generated_at).toLocaleTimeString()}</p>}
                </div>
                {previewData && (
                  <button onClick={handleDownload} disabled={generating}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                    {generating ? '…' : `↓ ${format.toUpperCase()}`}
                  </button>
                )}
              </div>

              {!previewData ? (
                <div className="py-16 text-center">
                  <ReportIcon type={selectedType?.icon ?? 'bar'} className="w-10 h-10 text-stone-200 dark:text-stone-700 mx-auto mb-3" />
                  <p className="text-sm text-stone-400 dark:text-stone-500">Click <span className="font-medium text-stone-600 dark:text-stone-300">Preview</span> to see your report data</p>
                </div>
              ) : previewData.rows.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-stone-400">No data found for the selected filters.</p>
                </div>
              ) : (
                <>
                  {/* Summary cards */}
                  {summaryStats && (
                    <div className="px-4 pt-4 grid grid-cols-3 gap-2">
                      <SummaryCard label={summaryStats.label1} value={summaryStats.val1} color={summaryStats.c1} />
                      <SummaryCard label={summaryStats.label2} value={summaryStats.val2} color={summaryStats.c2} />
                      <SummaryCard label={summaryStats.label3} value={summaryStats.val3} color={summaryStats.c3} />
                    </div>
                  )}

                  {/* Data table */}
                  <div className="p-4 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr>{previewHeaders.map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-stone-500 uppercase tracking-wider dark:text-stone-400 border-b border-stone-100 dark:border-stone-800">{h.replace(/_/g, ' ')}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                        {previewData.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                            {previewHeaders.map(h => <td key={h} className="px-3 py-2 text-stone-700 dark:text-stone-300 whitespace-nowrap">{String(row[h] ?? '')}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
