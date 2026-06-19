import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import DeadlineBadge from '../components/DeadlineBadge'
import Skeleton from '../components/Skeleton'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiQuery } from '../hooks/useApi'

interface Department { id: string; code: string; name: string }
type DeptTab = 'my' | 'department'
interface DeptDoc { id: number; tracking_number: string; title: string; status: string; priority: string; deadline: string | null; is_overdue: boolean; current_department: Department; created_at: string; updated_at: string }
interface DashboardData {
  counts: { total: number; pending: number; in_progress: number; forwarded: number; returned: number; overdue: number; completed: number }
  approaching_deadlines: { id: string; tracking_number: string; title: string; status: string; priority: string; deadline: string; current_department: Department }[]
  bottleneck: { department: Department; open_count: number } | null
  forwarded_to_me: { id: string; tracking_number: string; title: string; status: string; priority: string; forwarded_at: string; forwarded_by: string; routing_note: string }[]
}
interface PendingApproval { id: string; document_id: string; title: string; tracking_number: string; label: string; created_at: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
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
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="rounded-xl p-4 border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800/80"><Skeleton className="h-5 w-16 mb-2" /><Skeleton className="h-7 w-10" /></div>)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{error.message}</div>
      </div>
    )
  }

  if (!data) return null
  const { counts, approaching_deadlines, bottleneck, forwarded_to_me } = data
  const totalActions = forwarded_to_me.length + pendingApprovals.length

  const stats = [
    { label: 'Total', count: counts.total, color: 'text-stone-600 dark:text-stone-300', bg: 'bg-stone-100 dark:bg-stone-700' },
    { label: 'Pending', count: counts.pending, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'In Progress', count: counts.in_progress, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Overdue', count: counts.overdue, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Done', count: counts.completed, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
  ]

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Dashboard</h1>
            <p className="text-stone-400 text-sm mt-0.5">Welcome back, <span className="text-amber-400 font-medium">{user?.fullName}</span></p>
          </div>
          <Link to="/documents/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-stone-900 shadow-sm transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Document
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-5">

        {/* Stats — single clean row */}
        <div className="grid grid-cols-5 gap-3">
          {stats.map(s => (
            <div key={s.label} className={`rounded-xl p-3 text-center ${s.bg} border border-stone-200/50 dark:border-stone-700/50`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Bottleneck banner (admin) */}
        {user?.role === 'admin' && bottleneck && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800/40 px-4 py-3 flex items-center gap-3 text-sm">
            <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <span className="text-orange-700 dark:text-orange-400"><span className="font-bold">{bottleneck.department.name}</span> has {bottleneck.open_count} open document{bottleneck.open_count !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Two-column: Needs Action + Deadlines */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Needs Action — forwarded + approvals combined */}
          <div className="bg-white dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Needs Action</h2>
                {totalActions > 0 && <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">{totalActions}</span>}
              </div>
              <Link to="/documents?status=forwarded" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">View all</Link>
            </div>
            {totalActions === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-stone-400 dark:text-stone-500">
                <svg className="w-8 h-8 mx-auto mb-2 text-stone-300 dark:text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                All caught up
              </div>
            ) : (
              <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
                {forwarded_to_me.map(doc => (
                  <li key={doc.id}>
                    <button onClick={() => navigate(`/documents/${doc.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0">{doc.tracking_number}</span>
                        <span className="text-sm text-stone-700 dark:text-stone-200 truncate flex-1 group-hover:text-violet-600 dark:group-hover:text-violet-400">{doc.title}</span>
                        <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">{timeAgo(doc.forwarded_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-violet-600 dark:text-violet-400">forwarded{doc.forwarded_by ? ` by ${doc.forwarded_by}` : ''}</span>
                      </div>
                    </button>
                  </li>
                ))}
                {pendingApprovals.map(a => (
                  <li key={a.id}>
                    <button onClick={() => navigate(`/documents/${a.document_id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0">{a.tracking_number}</span>
                        <span className="text-sm text-stone-700 dark:text-stone-200 truncate flex-1 group-hover:text-amber-600 dark:group-hover:text-amber-400">{a.title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-amber-600 dark:text-amber-400">approval: {a.label}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Deadlines */}
          <div className="bg-white dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Upcoming Deadlines</h2>
              </div>
              <Link to="/documents" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">View all</Link>
            </div>
            {approaching_deadlines.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-stone-400 dark:text-stone-500">
                <svg className="w-8 h-8 mx-auto mb-2 text-stone-300 dark:text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                No deadlines in the next 7 days
              </div>
            ) : (
              <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
                {approaching_deadlines.map(doc => (
                  <li key={doc.id}>
                    <button onClick={() => navigate(`/documents/${doc.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0">{doc.tracking_number}</span>
                        <span className="text-sm text-stone-700 dark:text-stone-200 truncate flex-1 group-hover:text-red-600 dark:group-hover:text-red-400">{doc.title}</span>
                        <span className="text-[11px] font-semibold text-red-600 dark:text-red-400 shrink-0">{formatDate(doc.deadline)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={doc.status} />
                        <PriorityBadge priority={doc.priority} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Department Documents */}
        <div className="bg-white dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={() => setDeptTab('department')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${deptTab === 'department' ? 'bg-amber-500 text-white' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
                Department
              </button>
              <button onClick={() => setDeptTab('my')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${deptTab === 'my' ? 'bg-amber-500 text-white' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
                My Documents
              </button>
            </div>
            <Link to="/documents" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">View all</Link>
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
  const params = new URLSearchParams({ limit: '8', page: '1' })
  if (tab === 'department') params.set('department_id', String(user.departmentId))
  else params.set('created_by', String(user.id))

  const { data, isLoading } = useApiQuery<{ data: DeptDoc[] }>(`/api/documents?${params}`, {
    queryKey: ['documents', tab, user.departmentId, user.id],
  })

  const docs = Array.isArray(data?.data) ? data.data : []

  if (isLoading) return <div className="p-4 space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /></div>
  if (docs.length === 0) return <div className="py-10 text-center text-sm text-stone-400 dark:text-stone-500">No documents</div>
  return (
    <ul className="divide-y divide-stone-50 dark:divide-stone-700/60">
      {docs.map(doc => (
        <li key={doc.id}>
          <button onClick={() => navigate(`/documents/${doc.id}`)}
            className="w-full text-left px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors group">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 shrink-0">{doc.tracking_number}</span>
              <span className="text-sm text-stone-700 dark:text-stone-200 truncate flex-1 group-hover:text-amber-600 dark:group-hover:text-amber-400">{doc.title}</span>
              <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">{doc.current_department.code}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <StatusBadge status={doc.status} />
              <PriorityBadge priority={doc.priority} />
              {doc.deadline && <DeadlineBadge deadline={doc.deadline} isOverdue={doc.is_overdue} />}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
