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

  const refreshUnreadCount = useCallback(() => {
    if (!token) return
    fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setUnreadCount(data.unread_count ?? 0))
      .catch(() => { console.warn('[Notifications] Failed to fetch unread count') })
  }, [token])

  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
      setUnreadCount(0)
      return
    }
    refreshUnreadCount()
    intervalRef.current = setInterval(refreshUnreadCount, POLL_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [isAuthenticated, refreshUnreadCount])

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
