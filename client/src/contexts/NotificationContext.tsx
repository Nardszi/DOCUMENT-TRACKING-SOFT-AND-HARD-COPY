import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

interface NotificationContextValue {
  unreadCount: number
  refreshUnreadCount: () => void
}

const NotificationContext = createContext<NotificationContextValue>({ unreadCount: 0, refreshUnreadCount: () => {} })

const POLL_INTERVAL = 30000

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const closedRef = useRef(false)

  const refreshUnreadCount = useCallback(() => {
    if (!token) return
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setUnreadCount(data.unread_count ?? 0))
      .catch(() => { console.warn('[Notifications] Failed to fetch unread count') })
  }, [token])

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null }
      setUnreadCount(0)
      return
    }

    closedRef.current = false

    // Initial fetch
    refreshUnreadCount()

    // SSE connection for real-time updates
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      if (closedRef.current) return
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'notification') {
          setUnreadCount(prev => prev + 1)
        }
      } catch {}
    }

    es.onerror = () => {
      if (closedRef.current) return
      es.close()
      eventSourceRef.current = null
      // Fall back to polling
      if (!intervalRef.current) {
        intervalRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL)
      }
    }

    // Also keep polling as fallback (SSE might not always be available)
    intervalRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL)

    return () => {
      closedRef.current = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null }
    }
  }, [isAuthenticated, token, refreshUnreadCount])

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
