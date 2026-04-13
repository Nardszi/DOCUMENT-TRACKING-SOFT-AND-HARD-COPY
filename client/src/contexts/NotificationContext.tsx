import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'

interface NotificationContextValue {
  unreadCount: number
  refreshUnreadCount: () => void
}

const NotificationContext = createContext<NotificationContextValue>({ unreadCount: 0, refreshUnreadCount: () => {} })

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const esRef = useRef<EventSource | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(1000)

  const refreshUnreadCount = useCallback(() => {
    if (!token) return
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setUnreadCount(data.unread_count ?? 0))
      .catch(() => {})
  }, [token])

  const connect = useCallback(() => {
    if (!token || !isAuthenticated) return
    if (esRef.current) { esRef.current.close(); esRef.current = null }

    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
    esRef.current = es

    es.onopen = () => { retryDelay.current = 1000 }

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data)
        if (payload.type === 'notification') {
          setUnreadCount((c) => c + 1)
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      const delay = Math.min(retryDelay.current, 30000)
      retryDelay.current = Math.min(delay * 2, 30000)
      retryRef.current = setTimeout(connect, delay)
    }
  }, [token, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      if (esRef.current) { esRef.current.close(); esRef.current = null }
      if (retryRef.current) clearTimeout(retryRef.current)
      setUnreadCount(0)
      return
    }
    refreshUnreadCount()
    connect()
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null }
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [isAuthenticated, connect, refreshUnreadCount])

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
