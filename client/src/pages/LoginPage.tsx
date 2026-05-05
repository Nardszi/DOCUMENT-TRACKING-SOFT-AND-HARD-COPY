import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const reason = searchParams.get('reason')
  const returnUrl = searchParams.get('returnUrl') || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  const validateUsername = () => {
    if (!username.trim()) { setUsernameError('Username is required'); return false }
    setUsernameError(''); return true
  }

  const validatePassword = () => {
    if (!password) { setPasswordError('Password is required'); return false }
    setPasswordError(''); return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateUsername() || !validatePassword()) return
    setFormError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (res.ok) {
        const data = await res.json()
        login(data.token)
        navigate(returnUrl, { replace: true })
        return
      }
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}))
        setFormError(
          data.code === 'ACCOUNT_DEACTIVATED'
            ? 'Your account has been deactivated. Contact your administrator.'
            : 'Invalid username or password.',
        )
        return
      }
      setFormError('Unable to connect. Please try again.')
    } catch {
      setFormError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">

      {/* ════════════════════════════════════════
          LEFT — branding panel
      ════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden bg-[#1a1a1a]">

        {/* Background photo */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-60"
          style={{ backgroundImage: "url('/noneco-banner.jpg')" }}
        />

        {/* Gradient wash — moderate, left side darker for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#111111]/85 via-[#1a1a1a]/60 to-[#1a1a1a]/40" />

        {/* Thin amber left-edge accent */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-14 py-12">

          {/* Middle: hero copy */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-[0.3em] mb-5">
              Document Tracking System
            </p>

            <h1 className="text-[2.6rem] font-extrabold text-white leading-[1.1] mb-6">
              United in Service,{' '}
              <span className="text-amber-400">Empowering Lives.</span>
            </h1>

            <p className="text-sm text-stone-400 leading-relaxed mb-10 max-w-xs">
              Securely manage, route, and track official documents across every department — in real time.
            </p>


          </div>

          {/* Bottom: accreditation */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-700" />
            <p className="text-[10px] text-stone-600 tracking-widest uppercase whitespace-nowrap">
              NEA · PHILRECA · APEC
            </p>
            <div className="h-px flex-1 bg-stone-700" />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════
          RIGHT — form panel
      ════════════════════════════════════════ */}
      <div className="relative flex flex-col w-full lg:w-[480px] flex-shrink-0 bg-[#1a1a1a] lg:bg-white overflow-hidden">

        {/* Mobile: show the banner photo as background */}
        <div
          className="absolute inset-0 lg:hidden bg-cover bg-center opacity-50"
          style={{ backgroundImage: "url('/noneco-banner.jpg')" }}
          aria-hidden="true"
        />
        {/* Mobile: dark overlay for readability */}
        <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-[#0d0d0d]/90 via-[#1a1a1a]/80 to-amber-950/60 pointer-events-none" aria-hidden="true" />

        {/* Top amber rule */}
        <div className="relative z-10 h-[3px] bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />

        <div className="relative z-10 flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-10 xl:px-14 py-12">

          {/* Logo + org name */}
          <div className="flex items-center gap-4 mb-10">
            <img
              src="/noneco-logo.png"
              alt="NONECO Logo"
              className="w-12 h-12 object-contain flex-shrink-0"
            />
            <div className="border-l border-white/20 lg:border-stone-200 pl-4">
              <p className="text-sm font-bold text-amber-400 lg:text-stone-900 leading-tight tracking-wide">NONECO</p>
              <p className="text-[11px] text-stone-300 lg:text-stone-400 leading-tight mt-0.5">
                Northern Negros Electric Cooperative
              </p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-[1.6rem] font-bold text-white lg:text-stone-900 tracking-tight leading-tight">
              Sign in to your account
            </h2>
            <p className="text-sm text-stone-300 lg:text-stone-400 mt-1.5">
              Enter your credentials to access the system.
            </p>
          </div>

          {/* Status banners */}
          {reason === 'timeout' && (
            <div role="status" className="mb-6 flex items-start gap-3 rounded-xl bg-amber-500/20 border border-amber-500/30 lg:bg-amber-50 lg:border-amber-200 px-4 py-3.5 text-xs text-amber-200 lg:text-amber-800">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Your session expired due to inactivity. Please sign in again.</span>
            </div>
          )}
          {reason === 'logout' && (
            <div role="status" className="mb-6 flex items-start gap-3 rounded-xl bg-white/10 border border-white/20 lg:bg-stone-50 lg:border-stone-200 px-4 py-3.5 text-xs text-stone-200 lg:text-stone-600">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-stone-300 lg:text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>You have been signed out successfully.</span>
            </div>
          )}
          {formError && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl bg-red-500/20 border border-red-500/30 lg:bg-red-50 lg:border-red-200 px-4 py-3.5 text-xs text-red-200 lg:text-red-800">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{formError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={validateUsername}
                aria-describedby={usernameError ? 'username-error' : undefined}
                aria-invalid={!!usernameError}
                placeholder="Enter your username"
                className={`w-full rounded-xl border px-4 py-3 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 transition-all
                  bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900
                  focus:bg-white/20 lg:focus:bg-white ${
                  usernameError
                    ? 'border-red-400 focus:ring-red-300'
                    : 'border-white/20 lg:border-stone-200 focus:ring-amber-300 focus:border-amber-400'
                }`}
              />
              {usernameError && (
                <p id="username-error" className="mt-1.5 text-xs text-red-300 lg:text-red-600 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {usernameError}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={validatePassword}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  aria-invalid={!!passwordError}
                  placeholder="Enter your password"
                  className={`w-full rounded-xl border px-4 py-3 pr-12 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 transition-all
                    bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900
                    focus:bg-white/20 lg:focus:bg-white ${
                    passwordError
                      ? 'border-red-400 focus:ring-red-300'
                      : 'border-white/20 lg:border-stone-200 focus:ring-amber-300 focus:border-amber-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-stone-300 hover:text-white lg:text-stone-400 lg:hover:text-stone-600 focus:outline-none transition-colors"
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <p id="password-error" className="mt-1.5 text-xs text-red-300 lg:text-red-600 flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {passwordError}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-transparent lg:focus:ring-offset-white disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Help text */}
          <p className="mt-8 text-center text-xs text-stone-400">
            For account issues, contact your system administrator.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-8 sm:px-12 lg:px-10 xl:px-14 pb-8">
          <p className="text-[11px] text-stone-400 text-center">
            © {new Date().getFullYear()} Northern Negros Electric Cooperative, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
