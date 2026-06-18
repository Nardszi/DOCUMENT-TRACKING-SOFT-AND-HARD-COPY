import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { TableSkeleton } from '../components/Skeleton'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

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

const PAGE_SIZES = [10, 25, 50, 100]

// ── Human-readable action labels and icons ────────────────────────────────
interface ActionMeta { label: string; icon: JSX.Element; bg: string; text: string }

function ActionMetaFor(action: string): ActionMeta {
  const defaultMeta: ActionMeta = {
    label: action.replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    bg: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
    text: 'text-stone-600 dark:text-stone-300',
  }
  const map: Record<string, ActionMeta> = {
    'user.login.success': {
      label: 'Login',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>,
      bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    'user.login.failure': {
      label: 'Login Failed',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m21-5v-2a9 9 0 00-9 9v2" /></svg>,
      bg: 'bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-300',
      text: 'text-red-700 dark:text-red-300',
    },
    'user.logout': {
      label: 'Logout',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
      bg: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
      text: 'text-stone-600 dark:text-stone-300',
    },
    'user.created': {
      label: 'User Created',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>,
      bg: 'bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:text-sky-300',
      text: 'text-sky-700 dark:text-sky-300',
    },
    'user.updated': {
      label: 'User Updated',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
      bg: 'bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:text-sky-300',
      text: 'text-sky-700 dark:text-sky-300',
    },
    'user.deactivated': {
      label: 'User Deactivated',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>,
      bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300',
      text: 'text-amber-700 dark:text-amber-300',
    },
    'document.created': {
      label: 'Document Created',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
      bg: 'bg-violet-50 text-violet-700 dark:bg-violet-900/25 dark:text-violet-300',
      text: 'text-violet-700 dark:text-violet-300',
    },
    'document.forwarded': {
      label: 'Document Forwarded',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>,
      bg: 'bg-violet-50 text-violet-700 dark:bg-violet-900/25 dark:text-violet-300',
      text: 'text-violet-700 dark:text-violet-300',
    },
    'document.returned': {
      label: 'Document Returned',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>,
      bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300',
      text: 'text-amber-700 dark:text-amber-300',
    },
    'document.completed': {
      label: 'Document Completed',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    'document.archived': {
      label: 'Document Archived',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
      bg: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
      text: 'text-stone-600 dark:text-stone-300',
    },
    'document.restored': {
      label: 'Document Restored',
      icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
      bg: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
      text: 'text-stone-600 dark:text-stone-300',
    },
  }
  return map[action] ?? defaultMeta
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

function formatRelativeTime(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return formatTimestamp(iso)
  } catch { return iso }
}

function userInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function userColor(id: string) {
  const colors = [
    'bg-amber-500', 'bg-sky-500', 'bg-violet-500', 'bg-emerald-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
  ]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i)
  return colors[Math.abs(hash) % colors.length]
}

const inputCls = 'rounded-xl border border-stone-200 px-3.5 py-2 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-colors'

export default function AuditLogPage() {
  useDocumentTitle('Audit Log')
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

  const [expandedId, setExpandedId] = useState<string | null>(null)

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
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Audit Log</h1>
              <p className="text-stone-400 text-sm mt-0.5">
                {total > 0
                  ? <>{total.toLocaleString()} total entries{hasFilters ? ' (filtered)' : ''}</>
                  : 'System activity history'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400">Rows per page:</span>
            <div className="flex gap-1">
              {PAGE_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => handleLimitChange(s)}
                  className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    limit === s
                      ? 'bg-amber-500 text-white'
                      : 'bg-white/10 text-stone-300 hover:bg-white/20'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-5 space-y-4">

        {/* ── Filter bar ── */}
        <form onSubmit={handleFilterSubmit}
          className="bg-white rounded-2xl border border-stone-200 shadow-card p-4 dark:bg-stone-800/80 dark:border-stone-700">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-0 sm:min-w-[150px]">
              <label htmlFor="f-from" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">From</label>
              <input id="f-from" type="date" value={draft.from}
                onChange={(e) => handleDraftChange('from', e.target.value)}
                className={inputCls} />
            </div>
            <div className="flex flex-col gap-1 min-w-0 sm:min-w-[150px]">
              <label htmlFor="f-to" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">To</label>
              <input id="f-to" type="date" value={draft.to}
                onChange={(e) => handleDraftChange('to', e.target.value)}
                className={inputCls} />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0 sm:min-w-[180px]">
              <label htmlFor="f-action" className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Action</label>
              <input id="f-action" type="text" placeholder="e.g. document.created"
                value={draft.action}
                onChange={(e) => handleDraftChange('action', e.target.value)}
                className={inputCls} />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0 sm:min-w-[180px]">
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

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ── Table card ── */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
          {loading ? (
            <TableSkeleton rows={15} cols={5} />
          ) : entries.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-stone-700/60 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-stone-600 dark:text-stone-300">No entries found</p>
              {hasFilters && <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">Try adjusting your filters</p>}
            </div>
          ) : (
            <>
            {/* ── Desktop table ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-stone-50 dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400 w-[200px]">User</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400">Action</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400">Target</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400">Timestamp</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
                  {entries.map((entry) => {
                    const meta = ActionMetaFor(entry.action)
                    const isExpanded = expandedId === entry.id
                    const hasDetails = entry.details != null && Object.keys(entry.details).length > 0
                    return (
                      <tr key={entry.id}
                        className={`transition-colors ${isExpanded ? 'bg-amber-50/60 dark:bg-amber-900/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full ${userColor(entry.user_id)} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>
                              {userInitials(entry.user_full_name)}
                            </div>
                            <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate max-w-[140px]">
                              {entry.user_full_name || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${meta.bg}`}>
                              {meta.icon}
                              {meta.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {entry.target_type ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-700/60 text-[11px] font-mono font-semibold text-stone-600 dark:text-stone-300">
                                {entry.target_type}
                              </span>
                              {entry.target_id && (
                                <span className="text-xs text-stone-400 dark:text-stone-500 font-mono">
                                  #{entry.target_id.slice(0, 8)}&hellip;
                                </span>
                              )}
                            </div>
                          ) : <span className="text-xs text-stone-400">&mdash;</span>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            <time className="text-xs tabular-nums text-stone-600 dark:text-stone-300" title={formatTimestamp(entry.created_at)}>
                              {formatRelativeTime(entry.created_at)}
                            </time>
                            <span className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 tabular-nums">
                              {formatTimestamp(entry.created_at).split(', ').slice(0, 2).join(', ')}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {hasDetails && (
                            <button onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors">
                              <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Expanded detail rows (desktop) ── */}
            {expandedId && entries.some(e => e.id === expandedId && e.details && Object.keys(e.details).length > 0) && (
              <div className="hidden md:block border-t border-stone-200 dark:border-stone-700">
                {entries.filter(e => e.id === expandedId).map(entry => {
                  if (!entry.details || Object.keys(entry.details).length === 0) return null
                  return (
                    <div key={`${entry.id}-detail`} className="px-6 py-4 bg-amber-50/40 dark:bg-amber-900/10">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(entry.details).map(([key, val]) => (
                          <div key={key} className="bg-white dark:bg-stone-800/60 rounded-xl px-3.5 py-2.5 border border-stone-200/60 dark:border-stone-700/40">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">{key}</p>
                            <p className="text-sm font-medium text-stone-800 dark:text-stone-200 break-all">
                              {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '—')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Mobile card view ── */}
            <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-700/60">
              {entries.map((entry) => {
                const meta = ActionMetaFor(entry.action)
                const hasDetails = entry.details != null && Object.keys(entry.details).length > 0
                const isExpanded = expandedId === entry.id
                return (
                  <li key={entry.id}>
                    <div className="px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-full ${userColor(entry.user_id)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5`}>
                          {userInitials(entry.user_full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">
                              {entry.user_full_name || '—'}
                            </span>
                            <time className="text-[10px] text-stone-400 dark:text-stone-500 tabular-nums flex-shrink-0" title={formatTimestamp(entry.created_at)}>
                              {formatRelativeTime(entry.created_at)}
                            </time>
                          </div>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold ${meta.bg}`}>
                              {meta.icon}
                              {meta.label}
                            </span>
                            {entry.target_type && (
                              <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500">
                                {entry.target_type}{entry.target_id ? ` #${entry.target_id.slice(0, 8)}…` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {hasDetails && (
                        <>
                          <button onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            className="flex items-center gap-1.5 mt-1.5 ml-12 text-xs font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400 rounded-lg transition-colors">
                            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            {isExpanded ? 'Hide details' : 'View details'}
                          </button>
                          {isExpanded && (
                            <div className="mt-2 ml-12 space-y-2">
                              {Object.entries(entry.details ?? {}).map(([key, val]) => (
                                <div key={key} className="bg-stone-50 dark:bg-stone-800/60 rounded-xl px-3 py-2 border border-stone-100 dark:border-stone-700/40">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-0.5">{key}</p>
                                  <p className="text-xs font-medium text-stone-700 dark:text-stone-300 break-all">
                                    {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '—')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            </>
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
                  &laquo;
                </button>
                <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[32px] px-3 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors">
                  Prev
                </button>

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

                <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[32px] px-3 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors">
                  Next
                </button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}
                  className="rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-600 hover:bg-stone-50 min-h-[32px] px-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-stone-800 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700 transition-colors">
                  &raquo;
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
