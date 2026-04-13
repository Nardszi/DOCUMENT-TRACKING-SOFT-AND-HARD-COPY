import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

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
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'noneco_token'
const INACTIVITY_TIMEOUT = 1800000 // 30 minutes

function decodeToken(token: string): DecodedUser | null {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload))
    return {
      id: decoded.sub,
      role: decoded.role,
      departmentId: decoded.departmentId,
      fullName: decoded.fullName,
    }
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

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  const login = (newToken: string) => {
    const decoded = decodeToken(newToken)
    if (!decoded) return
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
    setUser(decoded)
  }

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      logout()
      window.location.href = '/login?reason=timeout'
    }, INACTIVITY_TIMEOUT)
  }

  useEffect(() => {
    if (!token) return

    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const
    resetTimer()
    events.forEach((e) => window.addEventListener(e, resetTimer))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, resetTimer))
    }
  }, [token])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
