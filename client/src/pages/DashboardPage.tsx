import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'

interface Department { id: string; code: string; name: string }
interface RecentDoc { id: string; tracking_number: string; title: string; status: string; priority: string; current_department: Department; updated_at: string }
interface DeadlineDoc { id: string; tracking_number: string; title: string; status: string; priority: string; deadline: string; current_department: Department }
interface DashboardData {
  counts: { total: number; pending: number; in_progress: number; forwarded: number; returned: number; overdue: number; completed: number }
  recently_updated: RecentDoc[]
  approaching_deadlines: DeadlineDoc[]
  bottleneck: { department: Department; open_count: number } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

interface StatCardProps {
  label: string; count: number
  bg: string; text: string; border: string; icon: React.ReactNode
}

function StatCard({ label, count, bg, text, border, icon }: StatCardProps) {
  return (
    <div className={`rounded-2xl p-4 border shadow-card flex flex-col gap-3 transition-shadow hover:shadow-card-md ${bg} ${border}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${text} bg-white/70 dark:bg-black/20`}>
        {icon}
      </div>
      <div>
        <p className={`text-2xl font-bold tracking-tight ${text}`}>{count}</p>
        <p className={`text-xs font-semibold uppercase tracking-wider ${text} opacity-70 mt-0.5`}>{label}</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error('Failed to load dashboard'); return r.json() })
      .then(d => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-500 dark:text-stone-400">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading dashboard…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{error}</div>
      </div>
    )
  }

  if (!data) return null
  const { counts, recently_updated, approaching_deadlines, bottleneck } = data

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Dashboard</h1>
            <p className="text-stone-400 text-sm mt-0.5">Welcome back, <span className="text-amber-400 font-medium">{user?.fullName}</span></p>
          </div>
          <Link to="/documents/new"
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-stone-900 shadow-sm transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Document
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Total" count={counts.total}
            bg="bg-white dark:bg-stone-800/80" border="border-stone-200 dark:border-stone-700" text="text-stone-700 dark:text-stone-200"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          />
          <StatCard label="Pending" count={counts.pending}
            bg="bg-white dark:bg-stone-800/80" border="border-stone-200 dark:border-stone-700" text="text-stone-500 dark:text-stone-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard label="In Progress" count={counts.in_progress}
            bg="bg-amber-50 dark:bg-amber-900/20" border="border-amber-200 dark:border-amber-800/40" text="text-amber-700 dark:text-amber-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          />
          <StatCard label="Overdue" count={counts.overdue}
            bg="bg-red-50 dark:bg-red-900/20" border="border-red-200 dark:border-red-800/40" text="text-red-600 dark:text-red-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
          <StatCard label="Completed" count={counts.completed}
            bg="bg-emerald-50 dark:bg-emerald-900/20" border="border-emerald-200 dark:border-emerald-800/40" text="text-emerald-700 dark:text-emerald-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>

        {/* Bottleneck (admin only) */}
        {user?.role === 'admin' && bottleneck && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800/40 p-4 flex items-center gap-3.5 shadow-card">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-4.5 h-4.5 w-[18px] h-[18px] text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wider">Department Bottleneck</p>
              <p className="text-sm text-orange-700 dark:text-orange-400 mt-0.5">
                <span className="font-bold">{bottleneck.department.name}</span> ({bottleneck.department.code}) — {bottleneck.open_count} open document{bottleneck.open_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Two lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Recently Updated */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
            <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Recently Updated</h2>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Last 10 documents</p>
              </div>
              <Link to="/documents" className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors">View all →</Link>
            </div>
            {recently_updated.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <svg className="w-8 h-8 mx-auto mb-2 text-stone-300 dark:text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-stone-400 dark:text-stone-500">No documents yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
                {recently_updated.map(doc => (
                  <li key={doc.id}>
                    <button onClick={() => navigate(`/documents/${doc.id}`)}
                      className="w-full text-left px-5 py-3 min-h-[52px] hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded">{doc.tracking_number}</span>
                        <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate flex-1 min-w-0 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{doc.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={doc.status} />
                        <PriorityBadge priority={doc.priority} />
                        <span className="text-xs text-stone-400 dark:text-stone-500 ml-auto">{formatDate(doc.updated_at)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Approaching Deadlines */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
            <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Approaching Deadlines</h2>
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Next 7 days</p>
            </div>
            {approaching_deadlines.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <svg className="w-8 h-8 mx-auto mb-2 text-emerald-300 dark:text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-stone-400 dark:text-stone-500">No upcoming deadlines.</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
                {approaching_deadlines.map(doc => (
                  <li key={doc.id}>
                    <button onClick={() => navigate(`/documents/${doc.id}`)}
                      className="w-full text-left px-5 py-3 min-h-[52px] hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded">{doc.tracking_number}</span>
                        <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate flex-1 min-w-0 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{doc.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={doc.status} />
                        <span className="text-xs text-stone-400 dark:text-stone-500">{doc.current_department.code}</span>
                        <span className="text-xs font-bold text-red-600 dark:text-red-400 ml-auto">Due {formatDate(doc.deadline)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
