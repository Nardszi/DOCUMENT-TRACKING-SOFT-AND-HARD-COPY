import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import DeadlineBadge from '../components/DeadlineBadge'
import Skeleton, { CardSkeleton } from '../components/Skeleton'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiQuery } from '../hooks/useApi'

interface Department { id: string; code: string; name: string }
interface DeadlineDoc { id: string; tracking_number: string; title: string; status: string; priority: string; deadline: string; current_department: Department }
type DeptTab = 'my' | 'department'
interface DeptDoc { id: number; tracking_number: string; title: string; status: string; priority: string; deadline: string | null; is_overdue: boolean; current_department: Department; created_at: string; updated_at: string }
interface DashboardData {
  counts: { total: number; pending: number; in_progress: number; forwarded: number; returned: number; overdue: number; completed: number }
  approaching_deadlines: DeadlineDoc[]
  bottleneck: { department: Department; open_count: number } | null
  forwarded_to_me: ForwardedDoc[]
}
interface ForwardedDoc { id: string; tracking_number: string; title: string; status: string; priority: string; deadline: string | null; current_department: Department; updated_at: string; forwarded_at: string; forwarded_by: string; routing_note: string }
interface PendingApproval { id: string; document_id: string; title: string; tracking_number: string; label: string; created_at: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

interface StatCardProps {
  label: string; count: number; linkTo: string
  accent: string; icon: React.ReactNode; iconBg: string
}

function StatCard({ label, count, linkTo, accent, icon, iconBg }: StatCardProps) {
  return (
    <a href={linkTo}
      className="group relative rounded-2xl bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 shadow-card hover:shadow-card-md transition-all duration-200 cursor-pointer block overflow-hidden">
      <div className={`h-1 w-full ${accent}`} />
      <div className="p-4 flex flex-col gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">{count}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mt-0.5">{label}</p>
        </div>
      </div>
    </a>
  )
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [deptTab, setDeptTab] = useState<DeptTab>('department')

  const { data, isLoading, error } = useApiQuery<DashboardData>('/api/dashboard')
  const { data: pendingApprovals = [] } = useApiQuery<PendingApproval[]>('/api/approvals/pending', { retry: false })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
        <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
          <div className="max-w-7xl mx-auto"><Skeleton className="h-6 w-48 mb-2" /><Skeleton className="h-4 w-64" /></div>
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
            {Array.from({ length: 7 }).map((_, i) => <div key={i} className="rounded-2xl p-4 border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/80"><Skeleton className="h-9 w-9 mb-3" /><Skeleton className="h-6 w-16 mb-1" /><Skeleton className="h-3 w-12" /></div>)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CardSkeleton count={5} />
            <CardSkeleton count={5} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{error.message}</div>
      </div>
    )
  }

  if (!data) return null
  const { counts, approaching_deadlines, bottleneck, forwarded_to_me } = data

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

          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-8 sm:pb-6">

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
          <StatCard label="Total" count={counts.total} linkTo="/documents"
            accent="bg-stone-600" iconBg="bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          />
          <StatCard label="Pending" count={counts.pending} linkTo="/documents?status=pending"
            accent="bg-stone-400" iconBg="bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard label="In Progress" count={counts.in_progress} linkTo="/documents?status=in_progress"
            accent="bg-amber-500" iconBg="bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          />
          <StatCard label="Forwarded" count={counts.forwarded} linkTo="/documents?status=forwarded"
            accent="bg-violet-500" iconBg="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>}
          />
          <StatCard label="Returned" count={counts.returned} linkTo="/documents?status=returned"
            accent="bg-rose-500" iconBg="bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>}
          />
          <StatCard label="Overdue" count={counts.overdue} linkTo="/documents?status=overdue"
            accent="bg-red-500" iconBg="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          />
          <StatCard label="Completed" count={counts.completed} linkTo="/documents?status=completed"
            accent="bg-emerald-500" iconBg="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>

        {/* Bottleneck (admin only) */}
        {user?.role === 'admin' && bottleneck && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800/40 p-4 flex items-center gap-3.5 shadow-card">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wider">Department Bottleneck</p>
              <p className="text-sm text-orange-700 dark:text-orange-400 mt-0.5 truncate">
                <span className="font-bold">{bottleneck.department.name}</span> ({bottleneck.department.code}) — {bottleneck.open_count} open document{bottleneck.open_count !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Forwarded to My Department */}
        {forwarded_to_me.length > 0 && (
          <div className="bg-white rounded-2xl border border-violet-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-violet-800/40">
            <div className="px-5 py-4 border-b border-violet-100 dark:border-violet-800/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Forwarded to My Department</h2>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{forwarded_to_me.length} document{forwarded_to_me.length !== 1 ? 's' : ''} awaiting your department's action</p>
                </div>
              </div>
              <Link to="/documents?status=forwarded" className="text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400">View all →</Link>
            </div>
            <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
              {forwarded_to_me.map(doc => (
                <li key={doc.id}>
                  <button onClick={() => navigate(`/documents/${doc.id}`)}
                    className="w-full text-left px-5 py-3 min-h-[52px] hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded">{doc.tracking_number}</span>
                      <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate flex-1 min-w-0 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">{doc.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={doc.status} />
                      <PriorityBadge priority={doc.priority} />
                      {doc.forwarded_by && <span className="text-xs text-stone-400 dark:text-stone-500">from {doc.forwarded_by}</span>}
                      {doc.routing_note && <span className="text-xs text-stone-400 dark:text-stone-500 italic truncate max-w-[200px]">"{doc.routing_note}"</span>}
                      <span className="text-xs text-stone-400 dark:text-stone-500 ml-auto">{formatRelativeTime(doc.forwarded_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pending Approvals */}
        {pendingApprovals.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-amber-800/40">
            <div className="px-5 py-4 border-b border-amber-100 dark:border-amber-800/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Pending Approvals</h2>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{pendingApprovals.length} item{pendingApprovals.length !== 1 ? 's' : ''} awaiting your review</p>
                </div>
              </div>
              <Link to="/approvals" className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400">Review all →</Link>
            </div>
            <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
              {pendingApprovals.map(a => (
                <li key={a.id}>
                  <button onClick={() => navigate(`/documents/${a.document_id}`)}
                    className="w-full text-left px-5 py-3 min-h-[52px] hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded">{a.tracking_number}</span>
                      <span className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate flex-1 min-w-0 group-hover:text-amber-700 dark:group-hover:text-amber-400">{a.title}</span>
                    </div>
                    <p className="text-xs text-stone-500 dark:text-stone-400">Step: {a.label}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Approaching Deadlines */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
            <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Approaching Deadlines</h2>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Next 7 days</p>
              </div>
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

        {/* My Department / My Documents */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
          <div className="px-5 pt-4 pb-0 flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={() => setDeptTab('department')}
                className={`px-4 py-2 rounded-t-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 ${deptTab === 'department' ? 'bg-amber-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
                Department Documents
              </button>
              <button onClick={() => setDeptTab('my')}
                className={`px-4 py-2 rounded-t-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 ${deptTab === 'my' ? 'bg-amber-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
                My Documents
              </button>
            </div>
            <Link to="/documents" className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors shrink-0">View all →</Link>
          </div>
          <DeptDocSection tab={deptTab} user={user} navigate={navigate} />
        </div>
      </div>
    </div>
  )
}

function DeptDocSection({ tab, user, navigate }: {
  tab: DeptTab; user: any; navigate: ReturnType<typeof useNavigate>
}) {
  const params = new URLSearchParams({ limit: '10', page: '1' })
  if (tab === 'department') params.set('department_id', String(user.departmentId))
  else params.set('created_by', String(user.id))

  const { data, isLoading } = useApiQuery<{ data: DeptDoc[] }>(`/api/documents?${params}`, {
    queryKey: ['documents', tab, user.departmentId, user.id],
  })

  const docs = Array.isArray(data?.data) ? data.data : []

  if (isLoading) return <div className="p-5 space-y-3"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /></div>
  if (docs.length === 0) return <div className="py-10 text-center text-sm text-stone-400">{tab === 'department' ? 'No documents in your department.' : 'No documents created by you.'}</div>
  return (
    <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
      {docs.map(doc => (
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
              {doc.deadline && <DeadlineBadge deadline={doc.deadline} isOverdue={doc.is_overdue} />}
              <span className="text-xs text-stone-400 dark:text-stone-500">{formatDate(doc.created_at)}</span>
              <span className="text-xs text-stone-400 dark:text-stone-500 ml-auto">{doc.current_department.code}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
