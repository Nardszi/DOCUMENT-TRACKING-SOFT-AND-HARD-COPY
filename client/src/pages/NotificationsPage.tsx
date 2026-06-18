import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { CardSkeleton } from '../components/Skeleton'

interface Notification {
  id: string; document_id: string | null; event_type: string
  message: string; is_read: boolean; created_at: string
}

type FilterTab = 'all' | 'unread'

const EVENT_META: Record<string, { label: string; icon: React.ReactNode; color: string; circleBg: string }> = {
  document_forwarded: {
    label: 'Forwarded',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    circleBg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>,
  },
  document_returned: {
    label: 'Returned',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    circleBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>,
  },
  document_cc: {
    label: "CC'd",
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    circleBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
  },
  deadline_approaching: {
    label: 'Deadline Approaching',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    circleBg: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  deadline_passed: {
    label: 'Deadline Passed',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    circleBg: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  },
  document_urgent: {
    label: 'Urgent',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    circleBg: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getDateGroup(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000)
  if (d >= today) return 'Today'
  if (d >= yesterday) return 'Yesterday'
  if (d >= weekStart) return 'This Week'
  return 'Earlier'
}

function groupByDate(notifications: Notification[]): [string, Notification[]][] {
  const groups = new Map<string, Notification[]>()
  for (const n of notifications) {
    const key = getDateGroup(n.created_at)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  }
  const order = ['Today', 'Yesterday', 'This Week', 'Earlier']
  return order.filter(k => groups.has(k)).map(k => [k, groups.get(k)!] as [string, Notification[]])
}

export default function NotificationsPage() {
  const { token } = useAuth()
  const { refreshUnreadCount } = useNotifications()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState<'idle' | 'loading' | 'done'>('idle')
  const [filter, setFilter] = useState<FilterTab>('all')
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set())

  const fetchNotifications = useCallback(() => {
    setLoading(true)
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => setNotifications(data.notifications ?? []))
      .catch(() => console.warn('[Notifications] Failed to load')).finally(() => setLoading(false))
  }, [token])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications])

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications
    return notifications.filter(n => !n.is_read)
  }, [notifications, filter])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])

  async function handleClick(n: Notification) {
    if (!n.is_read) {
      await fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }).catch(() => console.warn('[Notifications] Failed to mark as read'))
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      refreshUnreadCount()
    }
    if (n.document_id) navigate(`/documents/${n.document_id}`)
  }

  async function handleMarkAsRead(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setAnimatingIds(prev => new Set(prev).add(id))
    await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }).catch(() => console.warn('[Notifications] Failed to mark as read'))
    setNotifications(prev => prev.map(x => x.id === id ? { ...x, is_read: true } : x))
    refreshUnreadCount()
    setTimeout(() => setAnimatingIds(prev => { const s = new Set(prev); s.delete(id); return s }), 300)
  }

  async function handleMarkAll() {
    setMarkingAll('loading')
    await fetch('/api/notifications/read-all', { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }).catch(() => console.warn('[Notifications] Failed to mark all as read'))
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    refreshUnreadCount()
    setMarkingAll('done')
    setTimeout(() => setMarkingAll('idle'), 1500)
  }

  const empty = notifications.length === 0

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-2xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Notifications</h1>
            <p className="text-stone-400 text-sm mt-0.5">
              {unreadCount > 0 ? (
                <span className="text-amber-400 font-medium">{unreadCount} unread</span>
              ) : (
                <span className="text-stone-500"><span className="text-emerald-400 mr-1">✓</span>All caught up</span>
              )}
            </p>
          </div>
          <button
            onClick={handleMarkAll}
            disabled={markingAll !== 'idle' || unreadCount === 0}
            className="relative min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-stone-900 disabled:opacity-50 transition-all overflow-hidden"
          >
            <span className={`inline-flex items-center gap-1.5 transition-all ${markingAll === 'done' ? 'opacity-0 scale-75' : ''}`}>
              {markingAll === 'loading' ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              )}
              {markingAll === 'loading' ? 'Marking…' : 'Mark all read'}
            </span>
            {markingAll === 'done' && (
              <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-emerald-200 font-semibold animate-fade-in">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Done!
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Filter tabs */}
        {!loading && !empty && (
          <div className="flex gap-1 mb-5 bg-stone-100 dark:bg-stone-800/60 rounded-xl p-1 w-fit border border-stone-200 dark:border-stone-700/60">
            {(['all', 'unread'] as const).map(tab => (
              <button key={tab}
                onClick={() => setFilter(tab)}
                className={`relative px-4 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                  filter === tab
                    ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm border border-stone-200 dark:border-stone-600'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 border border-transparent'
                }`}
              >
                {tab === 'all' ? 'All' : 'Unread'}
                {tab === 'unread' && unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-5 dark:bg-stone-800/80 dark:border-stone-700 space-y-4">
            <CardSkeleton count={5} />
          </div>
        ) : empty ? (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-12 text-center dark:bg-stone-800/80 dark:border-stone-700">
            <div className="relative w-20 h-20 mx-auto mb-5">
              <div className="absolute inset-0 rounded-full bg-stone-100 dark:bg-stone-700" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-9 h-9 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 border-2 border-white dark:border-stone-800 flex items-center justify-center">
                <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </div>
            </div>
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">You're all caught up!</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-xs mx-auto leading-relaxed">
              New notifications about forwarded documents, deadlines, and updates will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([groupLabel, items]) => (
              <section key={groupLabel}>
                <h3 className="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2 px-1">{groupLabel}</h3>
                <ul className="space-y-1.5">
                  {items.map((n, idx) => {
                    const meta = EVENT_META[n.event_type]
                    return (
                      <li key={n.id}
                        onClick={() => handleClick(n)}
                        className={`group relative rounded-2xl border cursor-pointer transition-all duration-150 ${
                          !n.is_read
                            ? 'bg-white border-stone-200 shadow-sm hover:shadow-card dark:bg-stone-800/80 dark:border-stone-600'
                            : 'bg-white border-stone-100 hover:border-stone-200 hover:shadow-sm dark:bg-stone-800/50 dark:border-stone-700/60 dark:hover:bg-stone-800/80'
                        }`}
                        style={{ animationDelay: `${idx * 30}ms` }}
                      >
                        <div className="p-4 flex items-start gap-3.5">
                          {/* Icon circle */}
                          <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta?.circleBg ?? 'bg-stone-100 text-stone-500 dark:bg-stone-700'}`}>
                            {meta?.icon ?? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            {!n.is_read && (
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-stone-800" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold leading-tight ${meta?.color ?? 'bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-300'}`}>
                                {meta?.label ?? n.event_type}
                              </span>
                            </div>
                            <p className={`text-sm leading-snug ${n.is_read ? 'text-stone-600 dark:text-stone-400' : 'text-stone-900 dark:text-stone-100 font-medium'}`}>
                              {n.message}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <time className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">{formatTime(n.created_at)}</time>
                              <span className="text-[11px] text-stone-300 dark:text-stone-600">·</span>
                              <time className="text-[11px] text-stone-400 dark:text-stone-500">{formatShort(n.created_at)}</time>
                            </div>
                          </div>

                          {/* Right actions */}
                          <div className="flex items-center gap-1 flex-shrink-0 self-start pt-1">
                            {n.is_read ? (
                              <span className="text-[11px] text-stone-300 dark:text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity">Read</span>
                            ) : (
                              <button onClick={e => handleMarkAsRead(e, n.id)}
                                disabled={animatingIds.has(n.id)}
                                className="p-1.5 rounded-lg text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                title="Mark as read"
                              >
                                {animatingIds.has(n.id) ? (
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                )}
                              </button>
                            )}
                            {n.document_id && (
                              <svg className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
