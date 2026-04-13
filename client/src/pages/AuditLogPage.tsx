import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface AuditEntry {
  id: string
  user_id: string
  user_full_name: string
  action: string
  target_type: string
  target_id: string
  details: Record<string, unknown> | null
  created_at: string
}

interface AuditLogResponse {
  data: AuditEntry[]
  total: number
  page: number
  totalPages: number
}

interface Filters { from: string; to: string; action: string; user_id: string }
const EMPTY_FILTERS: Filters = { from: '', to: '', action: '', user_id: '' }

// How many rows per page — larger = fewer round-trips
const PAGE_SIZES = [10, 25, 50, 100]

// ── Action colour coding ──────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  'user.login.success':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'user.login.failure':  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'user.logout':         'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
  'user.created':        'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'user.updated':        'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'user.deactivated':    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'document.created':    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'document.forwarded':  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'document.returned':   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'document.completed':  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}
function actionColor(action: string) {
  return ACTION_COLORS[action] ?? 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

const inputCls = 'rounded-xl border border-stone-200 px-3.5 py-2 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-colors'

// ── Component ─────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const { user, token } = useAuth()

  const [entries, setEntries]       = useState<AuditEntry[]>([])
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage]             = useState(1)
  const [limit, setLimit]           = useState(10)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft]     = useState<Filters>(EMPTY_FILTERS)

  // Inline detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Debounce live search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchEntries = useCallback(async (p: number, lim: number, f: Filters) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(p))
      params.set('limit', String(lim))
      if (f.from)    params.set('from',    f.from)
      if (f.to)      params.set('to',      f.to)
      if (f.action)  params.set('action',  f.action)
      if (f.user_id) params.set('user_id', f.user_id)

      const res = await fetch(`/api/audit-log?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      const json: AuditLogResponse = await res.json()
      setEntries(json.data)
      setTotal(json.total)
      setTotalPages(json.totalPages)
    } catch {
      setError('Failed to load audit log entries. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (user?.role === 'admin') fetchEntries(page, limit, filters)
  }, [page, limit, filters, fetchEntries, user?.role])

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-8 text-center dark:bg-stone-800/80 dark:border-stone-700">
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">Access Denied</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">You do not have permission to view this page.</p>
        </div>
      </div>
    )
  }

  function applyFilters(f: Filters) {
    setPage(1)
    setFilters(f)
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault()
    applyFilters(draft)
  }

  function handleReset() {
    setDraft(EMPTY_FILTERS)
    applyFilters(EMPTY_FILTERS)
  }

  // Live search with debounce for text fields
  function handleDraftChange(field: keyof Filters, value: string) {
    const next = { ...draft, [field]: value }
    setDraft(next)
    if (field === 'action' || field === 'user_id') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => applyFilters(next), 400)
    }
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit)
    setPage(1)
  }

  const start = total === 0 ? 0 : (page - 1) * limit + 1
  const end   = Math.min(page * limit, total)
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">

      {/* ── Top banner ── */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Audit Log</h1>
            <p className="text-stone-400 text-sm mt-0.5">
              {total > 0
                ? <>{total.toLocaleString()} total entries{hasFilters ? ' (filtered)' : ''}</>
                : 'System activity history'}
            </p>
          </div>
          {/* Rows-per-page selector in banner */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">Rows per page:</span>
            <div className="flex gap-1">
              {PAGE_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleLimitChange(s)}
                  className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    limit === s
                      ? 'bg-amber-500 text-white'
                      : 'bg-white/10 text-stone-300 hover:bg-white/20'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-5 space-y-4">

        {/* ── Filter bar ── */}
        <form
          onSubmit={handleFilterSubmit}
          className="bg-white rounded-2xl border border-stone-200 shadow-card p-4 dark:bg-stone-800/80 dark:border-stone-700"
        >
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label htmlFor="f-from" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">From</label>
              <input id="f-from" type="date" value={draft.from}
                onChange={(e) => handleDraftChange('from', e.target.value)}
                className={inputCls} />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label htmlFor="f-to" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">To</label>
              <input id="f-to" type="date" value={draft.to}
                onChange={(e) => handleDraftChange('to', e.target.value)}
                className={inputCls} />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label htmlFor="f-action" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Action</label>
              <input id="f-action" type="text" placeholder="e.g. document.created"
                value={draft.action}
                onChange={(e) => handleDraftChange('action', e.target.value)}
                className={inputCls} />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label htmlFor="f-user" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">User</label>
              <input id="f-user" type="text" placeholder="Name or ID"
                value={draft.user_id}
                onChange={(e) => handleDraftChange('user_id', e.target.value)}
                className={inputCls} />
            </div>
            <div className="flex gap-2 pb-0.5">
              <button type="submit"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors shadow-sm">
                Apply
              </button>
              {hasFilters && (
                <button type="button" onClick={handleReset}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-600 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-600 transition-colors">
                  Clear
                </button>
              )}
            </div>
          </div>
        </form>

        {/* ── Error ── */}
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ── Table card ── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">

          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-stone-400 dark:text-stone-500">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading {limit} entries…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-10 h-10 mx-auto mb-3 text-stone-300 dark:text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm font-medium text-stone-500 dark:text-stone-400">No entries found</p>
              {hasFilters && <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">Try adjusting your filters</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-50 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700 sticky top-0 z-10">
                  <tr>
                    {['Timestamp', 'User', 'Action', 'Target', 'Details'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
                  {entries.map((entry) => {
                    const isExpanded = expandedId === entry.id
                    const hasDetails = entry.details != null && Object.keys(entry.details).length > 0
                    return (
                      <>
                        <tr
                          key={entry.id}
                          className={`transition-colors ${isExpanded ? 'bg-amber-50/60 dark:bg-amber-900/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'} ${hasDetails ? 'cursor-pointer' : ''}`}
                          onClick={() => hasDetails && setExpandedId(isExpanded ? null : entry.id)}
                        >
                          <td className="px-4 py-3 text-stone-500 dark:text-stone-400 whitespace-nowrap text-xs tabular-nums">
                            {formatTimestamp(entry.created_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-medium text-stone-800 dark:text-stone-100">
                              {entry.user_full_name || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${actionColor(entry.action)}`}>
                              {entry.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">
                            {entry.target_type
                              ? <span className="font-mono">{entry.target_type}{entry.target_id ? <span className="text-stone-400"> #{entry.target_id.slice(0, 8)}…</span> : ''}</span>
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-stone-400 dark:text-stone-500 max-w-[260px]">
                            {hasDetails ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono truncate">{JSON.stringify(entry.details)}</span>
                                <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            ) : '—'}
                          </td>
                        </tr>
                        {isExpanded && hasDetails && (
                          <tr key={`${entry.id}-detail`} className="bg-amber-50/40 dark:bg-amber-900/10">
                            <td colSpan={5} className="px-6 py-3">
                              <pre className="text-xs text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination footer ── */}
          {!loading && total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex-wrap gap-2">
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {start.toLocaleString()}–{end.toLocaleString()} of <span className="font-semibold text-stone-700 dark:text-stone-200">{total.toLocaleString()}</span> entries
                {totalPages > 1 && <span className="ml-1 text-stone-400">· Page {page} of {totalPages}</span>}
              </p>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={page <= 1} onClick={() => setPage(1)}
                  className="rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[32px] px-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors">
                  «
                </button>
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[32px] px-3 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors">
                  Prev
                </button>

                {/* Page number pills */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const mid = Math.min(Math.max(page, 3), totalPages - 2)
                  const p = totalPages <= 5 ? i + 1 : mid - 2 + i
                  if (p < 1 || p > totalPages) return null
                  return (
                    <button key={p} type="button" onClick={() => setPage(p)}
                      className={`rounded-lg min-h-[32px] min-w-[32px] text-xs font-semibold transition-all ${
                        p === page
                          ? 'bg-amber-500 text-white border border-amber-500'
                          : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700'
                      }`}>
                      {p}
                    </button>
                  )
                })}

                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[32px] px-3 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors">
                  Next
                </button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}
                  className="rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[32px] px-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors">
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
