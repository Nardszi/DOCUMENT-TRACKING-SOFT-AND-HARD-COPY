import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ActivityEvent {
  id: string
  type: string
  user_name: string
  document_title: string
  document_id: string
  tracking_number: string
  detail: string
  created_at: string
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

const EVENT_ICONS: Record<string, { color: string; svg: React.ReactNode }> = {
  forwarded: { color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400', svg: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg> },
  returned: { color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400', svg: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M21 10l-4-4M21 10l-4 4" /></svg> },
  completed: { color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', svg: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> },
  created: { color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400', svg: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> },
  approved: { color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', svg: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" /></svg> },
}

function getEventIcon(type: string) {
  for (const [key, val] of Object.entries(EVENT_ICONS)) {
    if (type.includes(key)) return val
  }
  return EVENT_ICONS.created
}

export default function ActivityFeed() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const eventSourceRef = useRef<EventSource | null>(null)
  const closedRef = useRef(false)

  useEffect(() => {
    if (!token) return
    closedRef.current = false

    fetch('/api/dashboard/activity-feed', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setEvents(Array.isArray(data) ? data.slice(0, 20) : []))
      .catch(() => {})
      .finally(() => setLoading(false))

    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
    eventSourceRef.current = es
    es.onmessage = (e) => {
      if (closedRef.current) return
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'activity' && event.activity) {
          setEvents(prev => [event.activity, ...prev].slice(0, 20))
        }
      } catch {}
    }
    es.onerror = () => { es.close(); eventSourceRef.current = null }

    return () => {
      closedRef.current = true
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null }
    }
  }, [token])

  if (loading) return <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-stone-100 dark:bg-stone-800 animate-pulse" />)}</div>

  if (events.length === 0) return (
    <div className="py-10 text-center">
      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
      </div>
      <p className="text-sm text-stone-500">No recent activity</p>
    </div>
  )

  return (
    <ul className="divide-y divide-stone-50 dark:divide-stone-800">
      {events.map(evt => {
        const icon = getEventIcon(evt.type)
        return (
          <li key={evt.id}>
            <button onClick={() => evt.document_id && navigate(`/documents/${evt.document_id}`)}
              className="w-full text-left px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors flex items-start gap-2.5">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${icon.color}`}>{icon.svg}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                  <span className="font-semibold">{evt.user_name}</span>
                  {' '}{evt.detail}
                  {evt.document_title && <span className="font-medium text-amber-600 dark:text-amber-400"> {evt.document_title}</span>}
                </p>
                <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{timeAgo(evt.created_at)}</p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
