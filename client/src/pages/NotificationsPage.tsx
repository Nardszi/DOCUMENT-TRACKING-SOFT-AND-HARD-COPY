import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'

interface Notification {
  id: string; document_id: string | null; event_type: string
  message: string; is_read: boolean; created_at: string
}

const EVENT_LABELS: Record<string, string> = {
  document_forwarded: 'Forwarded',
  document_returned: 'Returned',
  document_cc: "CC'd",
  deadline_approaching: 'Deadline Approaching',
  deadline_passed: 'Deadline Passed',
  document_urgent: 'Urgent',
}

const EVENT_COLORS: Record<string, string> = {
  document_forwarded: 'bg-purple-100 text-purple-700',
  document_returned: 'bg-amber-100 text-amber-700',
  document_cc: 'bg-blue-100 text-blue-700',
  deadline_approaching: 'bg-orange-100 text-orange-700',
  deadline_passed: 'bg-red-100 text-red-700',
  document_urgent: 'bg-red-100 text-red-700',
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NotificationsPage() {
  const { token } = useAuth()
  const { refreshUnreadCount } = useNotifications()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = useCallback(() => {
    setLoading(true)
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => setNotifications(data.notifications ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [token])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  async function handleClick(n: Notification) {
    if (!n.is_read) {
      await fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      refreshUnreadCount()
    }
    if (n.document_id) navigate(`/documents/${n.document_id}`)
  }

  async function handleMarkAll() {
    setMarkingAll(true)
    await fetch('/api/notifications/read-all', { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    refreshUnreadCount()
    setMarkingAll(false)
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

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
                'All caught up'
              )}
            </p>
          </div>
          <button
            onClick={handleMarkAll}
            disabled={markingAll || notifications.every(n => n.is_read)}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-stone-900 disabled:opacity-50 transition-colors"
          >
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-8 text-center text-stone-500 dark:bg-stone-800/80 dark:border-stone-700 dark:text-stone-400">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-12 text-center dark:bg-stone-800/80 dark:border-stone-700">
            <div className="w-16 h-16 rounded-full bg-stone-100 dark:bg-stone-700 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">You're all caught up!</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">No notifications yet.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map(n => (
              <li key={n.id} onClick={() => handleClick(n)}
                className={`rounded-2xl border cursor-pointer transition-all ${
                  !n.is_read
                    ? 'bg-white border-stone-200 border-l-4 border-l-amber-500 shadow-card dark:bg-stone-800/80 dark:border-stone-600 dark:border-l-amber-500'
                    : 'bg-white border-stone-200 hover:bg-stone-50 shadow-card dark:bg-stone-800/80 dark:border-stone-700 dark:hover:bg-stone-700/60'
                }`}>
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${EVENT_COLORS[n.event_type] ?? 'bg-stone-100 text-stone-700'}`}>
                        {EVENT_LABELS[n.event_type] ?? n.event_type}
                      </span>
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" aria-label="Unread" />}
                    </div>
                    <p className={`text-sm ${n.is_read ? 'text-stone-600 dark:text-stone-400' : 'text-stone-900 dark:text-stone-100 font-medium'}`}>{n.message}</p>
                    <time className="text-xs text-stone-400 dark:text-stone-500 mt-1 block">{formatDateTime(n.created_at)}</time>
                  </div>
                  {n.document_id && (
                    <svg className="w-4 h-4 text-stone-400 dark:text-stone-500 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
