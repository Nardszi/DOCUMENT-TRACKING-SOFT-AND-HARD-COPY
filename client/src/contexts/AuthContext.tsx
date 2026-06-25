import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { TOKEN_KEY } from '../utils/api'

// Cross-tab sync channel
const AUTH_CHANNEL = 'noneco-auth-sync'
let broadcastChannel: BroadcastChannel | null = null
try { broadcastChannel = new BroadcastChannel(AUTH_CHANNEL) } catch {} // eslint-disable-line no-empty

export type DecodedUser = {
  id: string
  role: 'staff' | 'department_head' | 'admin'
  departmentId: string
  fullName: string
}

type AuthContextValue = {
  user: DecodedUser | null
  token: string | null
  login: (token: string) => void
  logout: () => void
  refreshToken: () => Promise<string | null>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const INACTIVITY_TIMEOUT = 1800000 // 30 minutes

function decodeToken(token: string): DecodedUser | null {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload))
    return {
      id: decoded.sub,
      role: decoded.role,
      departmentId: String(decoded.departmentId),
      fullName: decoded.fullName,
    }
  } catch {
    return null
  }
}

export function getTokenExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload))
    return decoded.exp ? decoded.exp * 1000 : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<DecodedUser | null>(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    return stored ? decodeToken(stored) : null
  })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ACTIVE_KEY = 'noneco_last_activity'

  // Sync logout across tabs
  useEffect(() => {
    if (!broadcastChannel) return
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'logout') {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUser(null)
      }
      if (e.data?.type === 'login' && e.data?.token) {
        const decoded = decodeToken(e.data.token)
        if (decoded) {
          localStorage.setItem(TOKEN_KEY, e.data.token)
          setToken(e.data.token)
          setUser(decoded)
        }
      }
    }
    broadcastChannel.addEventListener('message', handler)
    return () => broadcastChannel.removeEventListener('message', handler)
  }, [])

  // Listen for forced logout from api.ts
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
      setUser(null)
    }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    broadcastChannel?.postMessage({ type: 'logout' })
  }, [])

  const login = useCallback((newToken: string) => {
    const decoded = decodeToken(newToken)
    if (!decoded) return
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(decoded)
    broadcastChannel?.postMessage({ type: 'login', token: newToken })
  }, [])

  const refreshToken = useCallback(async (): Promise<string | null> => {
    const currentToken = localStorage.getItem(TOKEN_KEY)
    if (!currentToken) return null
    try {
      const res = await fetch('/api/auth/refresh', {
        headers: { Authorization: `Bearer ${currentToken}` },
      })
      if (!res.ok) return null
      const data = await res.json()
      login(data.token)
      return data.token
    } catch {
      return null
    }
  }, [login])

  const resetTimer = useCallback(() => {
    const now = Date.now()
    localStorage.setItem(ACTIVE_KEY, String(now))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      // Check if other tabs have recent activity
      const last = parseInt(localStorage.getItem(ACTIVE_KEY) || '0', 10)
      if (Date.now() - last < INACTIVITY_TIMEOUT) {
        resetTimer()
        return
      }
      logout()
      window.location.href = '/login?reason=timeout'
    }, INACTIVITY_TIMEOUT)
  }, [logout])

  useEffect(() => {
    if (!token) return

    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const
    resetTimer()

    const handleActivity = () => resetTimer()
    events.forEach((e) => window.addEventListener(e, handleActivity))

    // Sync activity across tabs via storage events
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_KEY && e.newValue) {
        const otherTabActivity = parseInt(e.newValue, 10)
        const ourLast = parseInt(localStorage.getItem(ACTIVE_KEY) || '0', 10)
        if (otherTabActivity > ourLast) {
          localStorage.setItem(ACTIVE_KEY, e.newValue)
          resetTimer()
        }
      }
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, handleActivity))
      window.removeEventListener('storage', handleStorage)
    }
  }, [token, resetTimer])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshToken, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
