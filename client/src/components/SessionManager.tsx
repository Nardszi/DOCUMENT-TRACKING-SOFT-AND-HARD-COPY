import { useEffect, useRef, useCallback } from 'react'
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
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inactivityWarningRef = useRef(false)
  const inactivityWarnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null }
    if (inactivityWarnTimerRef.current) { clearTimeout(inactivityWarnTimerRef.current); inactivityWarnTimerRef.current = null }
  }, [])

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer()
    inactivityWarningRef.current = false

    // Warning at 28 minutes
    inactivityWarnTimerRef.current = setTimeout(() => {
      if (!inactivityWarningRef.current) {
        inactivityWarningRef.current = true
        showToast('You will be logged out in 2 minutes due to inactivity.', 'warning')
      }
    }, INACTIVITY_WARNING_MS)

    // Logout at 30 minutes
    inactivityTimerRef.current = setTimeout(() => {
      showToast('Logged out due to inactivity.', 'info')
      logout()
    }, INACTIVITY_TIMEOUT_MS)
  }, [clearInactivityTimer, showToast, logout])

  // Inactivity tracker
  useEffect(() => {
    if (!token) return

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    const resetTimer = () => startInactivityTimer()

    events.forEach(e => document.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      events.forEach(e => document.removeEventListener(e, resetTimer))
      clearInactivityTimer()
    }
  }, [token, startInactivityTimer, clearInactivityTimer])

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
  }, [token, refreshToken, showToast])

  return null
}
