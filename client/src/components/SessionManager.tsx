import { useEffect, useRef } from 'react'
import { useAuth, getTokenExp } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'

const WARNING_BEFORE_MS = 120_000 // 2 minutes
const REFRESH_BEFORE_MS = 60_000  // 1 minute
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const INACTIVITY_WARNING_MS = 28 * 60 * 1000 // warn at 28 min

export default function SessionManager() {
  const { token, refreshToken, logout } = useAuth()
  const { showToast } = useToast()
  const warnedRef = useRef(false)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityRef = useRef(Date.now())
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inactivityWarnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inactivity tracker — uses refs, no re-render dependency
  useEffect(() => {
    if (!token) return

    lastActivityRef.current = Date.now()

    function scheduleTimers() {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      if (inactivityWarnTimerRef.current) clearTimeout(inactivityWarnTimerRef.current)

      inactivityWarnTimerRef.current = setTimeout(() => {
        showToast('You will be logged out in 2 minutes due to inactivity.', 'warning')
      }, INACTIVITY_WARNING_MS)

      inactivityTimerRef.current = setTimeout(() => {
        showToast('Logged out due to inactivity.', 'info')
        logout()
      }, INACTIVITY_TIMEOUT_MS)
    }

    function onActivity() {
      lastActivityRef.current = Date.now()
      scheduleTimers()
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => document.addEventListener(e, onActivity, { passive: true }))
    scheduleTimers()

    return () => {
      events.forEach(e => document.removeEventListener(e, onActivity))
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      if (inactivityWarnTimerRef.current) clearTimeout(inactivityWarnTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Token expiry handling
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
          showToast('Unable to refresh session. Please save your work and sign in again.', 'warning')
        }
      }, refreshDelay)
      return () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return null
}
