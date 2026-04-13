import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface Department { id: string; code: string; name: string }
interface Category { id: string; name: string }

const REPORT_TYPES = [
  { value: 'document_volume', label: 'Document Volume', desc: 'Count of documents per department per period' },
  { value: 'overdue_documents', label: 'Overdue Documents', desc: 'All overdue documents with age' },
  { value: 'average_resolution_time', label: 'Average Resolution Time', desc: 'Avg days from creation to completion' },
  { value: 'user_activity', label: 'User Activity', desc: 'Actions, routings, and creations per user' },
]

const fieldCls = 'w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 min-h-[40px] dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-colors'

export default function ReportsPage() {
  const { user, token } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [reportType, setReportType] = useState('document_volume')
  const [format, setFormat] = useState('pdf')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/departments', { headers }).then(r => r.json()),
      fetch('/api/categories', { headers }).then(r => r.json()),
    ]).then(([depts, cats]) => {
      setDepartments(Array.isArray(depts) ? depts : [])
      setCategories(Array.isArray(cats) ? cats : [])
    }).catch(() => {})
  }, [token])

  if (user?.role !== 'department_head' && user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-8 text-center dark:bg-stone-800/80 dark:border-stone-700">
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">Access Denied</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">You do not have permission to view this page.</p>
        </div>
      </div>
    )
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSuccess(false); setGenerating(true)
    try {
      const body: Record<string, string> = { report_type: reportType, format }
      if (dateFrom) body.date_from = dateFrom
      if (dateTo) body.date_to = dateTo
      if (departmentId) body.department_id = departmentId
      if (status) body.status = status
      if (categoryId) body.category_id = categoryId
      if (priority) body.priority = priority
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error?.message || 'Failed to generate report.') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `report-${reportType}-${new Date().toISOString().slice(0, 10)}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to generate report.') }
    finally { setGenerating(false) }
  }

  const selectedType = REPORT_TYPES.find(r => r.value === reportType)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-white tracking-tight">Reports</h1>
          <p className="text-stone-400 text-sm mt-0.5">Generate and export document activity reports</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
            Report downloaded successfully.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
          {/* Report type selector */}
          <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Report Type</h2>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Select the type of report to generate</p>
          </div>
          <div className="p-5 border-b border-stone-100 dark:border-stone-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REPORT_TYPES.map(r => (
                <button key={r.value} type="button" onClick={() => setReportType(r.value)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    reportType === r.value
                      ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-900/20 dark:border-amber-500'
                      : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-600 dark:hover:border-stone-500 dark:hover:bg-stone-700'
                  }`}>
                  <p className={`text-sm font-semibold ${reportType === r.value ? 'text-amber-700 dark:text-amber-400' : 'text-stone-800 dark:text-stone-200'}`}>{r.label}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleGenerate} className="p-5 space-y-4">
            {/* Format */}
            <div>
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Export Format</label>
              <div className="flex gap-3">
                {[{ value: 'pdf', label: 'PDF' }, { value: 'xlsx', label: 'Excel (XLSX)' }].map(f => (
                  <button key={f.value} type="button" onClick={() => setFormat(f.value)}
                    className={`flex-1 min-h-[40px] rounded-xl border text-sm font-medium transition-all ${
                      format === f.value
                        ? 'border-amber-400 bg-amber-50 text-amber-700 ring-1 ring-amber-400 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-500'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Date From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={fieldCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Date To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={fieldCls} />
              </div>
            </div>

            {/* Filters */}
            <div>
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Department</label>
              <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={fieldCls}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className={fieldCls}>
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="forwarded">Forwarded</option>
                  <option value="returned">Returned</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Category</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={fieldCls}>
                  <option value="">All</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className={fieldCls}>
                  <option value="">All</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={generating}
              className="w-full min-h-[40px] rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {generating ? 'Generating…' : `Generate ${selectedType?.label ?? 'Report'}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
