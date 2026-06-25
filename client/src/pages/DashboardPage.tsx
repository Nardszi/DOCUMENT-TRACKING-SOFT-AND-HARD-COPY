import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import Skeleton from '../components/Skeleton'
import ActivityFeed from '../components/ActivityFeed'
import QuickCreate from '../components/QuickCreate'
import DashboardWidgetSettings, { useDashboardWidgets } from '../components/DashboardWidgetSettings'
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

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [deptTab, setDeptTab] = useState<DeptTab>('department')
  const { widgets, toggleWidget, moveWidget, resetWidgets } = useDashboardWidgets()
  const [showWidgetSettings, setShowWidgetSettings] = useState(false)

  const { data, isLoading, error } = useApiQuery<DashboardData>('/api/dashboard')
  const { data: pendingApprovals = [] } = useApiQuery<PendingApproval[]>('/api/approvals/pending', { retry: false })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <Skeleton className="h-7 w-40" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-xl p-5 border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"><Skeleton className="h-4 w-16 mb-3" /><Skeleton className="h-8 w-12" /></div>)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Skeleton className="h-64 rounded-xl lg:col-span-3" />
            <Skeleton className="h-64 rounded-xl lg:col-span-2" />
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
  const actionCount = forwarded_to_me.length + pendingApprovals.length
  const isVisible = (id: string) => widgets.find(w => w.id === id)?.visible !== false
  const sortedWidgets = [...widgets].sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">Dashboard</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">Welcome back, {user?.fullName}</p>
          </div>
          <div className="flex items-center gap-2 relative">
            <button onClick={() => setShowWidgetSettings(v => !v)}
              className="p-2 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              aria-label="Customize dashboard">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            {showWidgetSettings && (
              <DashboardWidgetSettings widgets={widgets} onToggle={toggleWidget} onMove={moveWidget} onReset={resetWidgets} onClose={() => setShowWidgetSettings(false)} />
            )}
            <QuickCreate />
          </div>
        </div>

        {/* Widget sections */}
        {sortedWidgets.map(w => {
          if (!w.visible) return null
          switch (w.id) {
            case 'kpi': return (
              <div key="kpi" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard label="Total Documents" value={counts.total} href="/documents"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                  iconColor="text-stone-500 dark:text-stone-400" />
                <KpiCard label="Needs Action" value={actionCount} href="/documents?status=forwarded"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  iconColor="text-amber-500" accent={actionCount > 0} />
                <KpiCard label="Overdue" value={counts.overdue} href="/documents?status=overdue"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                  iconColor="text-red-500" accent={counts.overdue > 0} />
                <KpiCard label="Completed" value={counts.completed} href="/documents?status=completed"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  iconColor="text-emerald-500" />
              </div>
            )
            case 'bottleneck': return user?.role === 'admin' && bottleneck ? (
              <div key="bottleneck" className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900/50 px-4 py-3 flex items-center gap-3">
                <svg className="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" /></svg>
                <p className="text-sm text-orange-700 dark:text-orange-400">
                  <span className="font-semibold">{bottleneck.department.name}</span> has {bottleneck.open_count} open document{bottleneck.open_count !== 1 ? 's' : ''}
                </p>
              </div>
            ) : null
            case 'action':
            case 'deadlines': return null
            case 'documents': return (
              <div key="documents" className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
                    <button onClick={() => setDeptTab('department')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${deptTab === 'department' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
                      Department
                    </button>
                    <button onClick={() => setDeptTab('my')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${deptTab === 'my' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
                      My Documents
                    </button>
                  </div>
                  <Link to="/documents" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">View all</Link>
                </div>
                <DeptDocSection tab={deptTab} user={user} navigate={navigate} />
              </div>
            )
            case 'activity': return (
              <div key="activity" className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Recent Activity</span>
                  <span className="flex items-center gap-1 text-[10px] text-stone-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <ActivityFeed />
                </div>
              </div>
            )
            default: return null
          }
        })}

        {/* Action + Deadline cards (always shown) */}
        {isVisible('action') && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Needs Action</span>
                  {actionCount > 0 && <span className="text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">{actionCount}</span>}
                </div>
                <Link to="/documents?status=forwarded" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">View all</Link>
              </div>
              {actionCount === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-stone-400">All caught up</p>
                </div>
              ) : (
                <ul className="divide-y divide-stone-50 dark:divide-stone-800">
                  {forwarded_to_me.slice(0, 5).map(doc => (
                    <li key={doc.id}>
                      <button onClick={() => navigate(`/documents/${doc.id}`)}
                        className="w-full text-left px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors group flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{doc.title}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-stone-400 dark:text-stone-500">{doc.tracking_number}</span>
                            {doc.forwarded_by && <span className="text-xs text-stone-400 dark:text-stone-500">from {doc.forwarded_by}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-stone-400 dark:text-stone-500 shrink-0">{timeAgo(doc.forwarded_at)}</span>
                      </button>
                    </li>
                  ))}
                  {pendingApprovals.slice(0, 3).map(a => (
                    <li key={a.id}>
                      <button onClick={() => navigate(`/documents/${a.document_id}`)}
                        className="w-full text-left px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors group flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">{a.title}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono text-stone-400 dark:text-stone-500">{a.tracking_number}</span>
                            <span className="text-xs text-amber-600 dark:text-amber-400">{a.label}</span>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Deadlines — right column */}
            {isVisible('deadlines') && (
              <div className="lg:col-span-2 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Deadlines</span>
                  <Link to="/documents" className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">View all</Link>
                </div>
                {approaching_deadlines.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-5 h-5 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-sm text-stone-500 dark:text-stone-400">No deadlines soon</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-50 dark:divide-stone-800">
                    {approaching_deadlines.slice(0, 6).map(doc => (
                      <li key={doc.id}>
                        <button onClick={() => navigate(`/documents/${doc.id}`)}
                          className="w-full text-left px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors group">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-stone-700 dark:text-stone-300 truncate group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">{doc.title}</span>
                            <span className="text-xs font-medium text-red-600 dark:text-red-400 shrink-0">{formatShortDate(doc.deadline)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <StatusBadge status={doc.status} />
                            <PriorityBadge priority={doc.priority} />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, href, icon, iconColor, accent }: {
  label: string; value: number; href: string
  icon: React.ReactNode; iconColor: string; accent?: boolean
}) {
  return (
    <a href={href}
      className={`block rounded-xl border p-4 transition-all hover:shadow-md ${accent ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">{label}</span>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">{value}</p>
    </a>
  )
}

function DeptDocSection({ tab, user, navigate }: {
  tab: DeptTab; user: any; navigate: ReturnType<typeof useNavigate>
}) {
  if (!user) return null
  const params = new URLSearchParams({ limit: '6', page: '1' })
  if (tab === 'department') params.set('department_id', String(user.departmentId))
  else params.set('created_by', String(user.id))

  const { data, isLoading } = useApiQuery<{ data: DeptDoc[] }>(`/api/documents?${params}`, {
    queryKey: ['documents', tab, user.departmentId, user.id],
  })

  const docs = Array.isArray(data?.data) ? data.data : []

  if (isLoading) return <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
  if (docs.length === 0) return <div className="py-10 text-center text-sm text-stone-400 dark:text-stone-500">No documents</div>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-100 dark:border-stone-800">
            <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wide">Document</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wide hidden md:table-cell">Priority</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wide hidden lg:table-cell">Dept</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
          {docs.map(doc => (
            <tr key={doc.id} onClick={() => navigate(`/documents/${doc.id}`)}
              className="hover:bg-stone-50 dark:hover:bg-stone-800/50 cursor-pointer transition-colors">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-stone-400 dark:text-stone-500">{doc.tracking_number}</span>
                  <span className="text-sm text-stone-700 dark:text-stone-300 truncate max-w-[200px]">{doc.title}</span>
                </div>
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell"><StatusBadge status={doc.status} /></td>
              <td className="px-4 py-2.5 hidden md:table-cell"><PriorityBadge priority={doc.priority} /></td>
              <td className="px-4 py-2.5 hidden lg:table-cell">
                <span className="text-xs text-stone-500 dark:text-stone-400">{doc.current_department.code}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
