import { useEffect, useRef } from 'react'
import { useAuth, getTokenExp } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'

const WARNING_BEFORE_MS = 120_000 // 2 minutes
const REFRESH_BEFORE_MS = 60_000  // 1 minute

export default function SessionManager() {
  const { token, refreshToken, logout } = useAuth()
  const { showToast } = useToast()
  const warnedRef = useRef(false)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) return
    warnedRef.current = false
    const exp = getTokenExp(token)
    if (!exp) return

    const now = Date.now()
    const remaining = exp - now

    // Session warning toast
    const warnDelay = remaining - WARNING_BEFORE_MS
    if (warnDelay > 0) {
      const warnTimer = setTimeout(() => {
        if (!warnedRef.current) {
          warnedRef.current = true
          showToast('Your session is about to expire. Refresh to stay logged in.', 'info')
        }
      }, warnDelay)
      return () => clearTimeout(warnTimer)
    }

    // Auto-refresh
    const refreshDelay = remaining - REFRESH_BEFORE_MS
    if (refreshDelay > 0) {
      refreshTimerRef.current = setTimeout(async () => {
        const newToken = await refreshToken()
        if (newToken) {
          showToast('Session refreshed automatically.', 'success')
        } else {
          showToast('Session expired. Please sign in again.', 'error')
          logout()
        }
      }, refreshDelay)
      return () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      }
    }
  }, [token, refreshToken, logout, showToast])

  return null
}
