import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function ResetPasswordPage() {
  useDocumentTitle('Reset Password')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (!token) { setError('Missing reset token.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error?.message || 'Reset failed. The link may have expired.')
      }
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <div className="text-center max-w-md mx-auto p-8">
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">Invalid Reset Link</h2>
          <p className="text-sm text-stone-500 mb-4">This link is missing the reset token. Please request a new one.</p>
          <Link to="/forgot-password" className="text-amber-500 hover:text-amber-400 font-semibold text-sm">Request new reset link</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-white dark:bg-stone-950">
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden bg-[#1a1a1a]">
        <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: "url('/noneco-banner.jpg')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#111111]/85 via-[#1a1a1a]/60 to-[#1a1a1a]/40" />
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600" />
        <div className="relative z-10 flex flex-col h-full px-14 py-12">
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-[0.3em] mb-5">Document Tracking System</p>
            <h1 className="text-[2.6rem] font-extrabold text-white leading-[1.1] mb-6">Set New Password</h1>
            <p className="text-sm text-stone-400 leading-relaxed max-w-xs">Choose a strong password for your account.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-700" /><p className="text-[10px] text-stone-600 tracking-widest uppercase whitespace-nowrap">NEA · PHILRECA · APEC</p><div className="h-px flex-1 bg-stone-700" />
          </div>
        </div>
      </div>
      <div className="relative flex flex-col w-full lg:w-[480px] flex-shrink-0 bg-[#1a1a1a] lg:bg-white overflow-hidden">
        <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-[#0d0d0d] via-[#1a1a1a] to-stone-900 pointer-events-none" />
        <div className="relative z-10 h-[3px] bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
        <div className="relative z-10 flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-10 xl:px-14 py-12">
          <div className="flex items-center gap-4 mb-8">
            <img src="/noneco-logo.png" alt="NONECO Logo" className="w-12 h-12 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20 lg:ring-stone-200" />
            <div className="border-l border-white/20 lg:border-stone-200 pl-4">
              <p className="text-sm font-bold text-amber-400 lg:text-stone-900 leading-tight tracking-wide">NONECO</p>
              <p className="text-[11px] text-stone-300 lg:text-stone-400 leading-tight mt-0.5">Northern Negros Electric Cooperative</p>
            </div>
          </div>
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white lg:text-stone-900 mb-2">Password Reset!</h2>
              <p className="text-sm text-stone-300 lg:text-stone-500 mb-6">Your password has been changed successfully.</p>
              <Link to="/login" className="inline-block min-h-[44px] leading-[44px] px-6 rounded-xl bg-amber-500 text-sm font-bold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all shadow-sm">Sign In</Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-[1.6rem] font-bold text-white lg:text-stone-900 tracking-tight leading-tight">Set New Password</h2>
                <p className="text-sm text-stone-300 lg:text-stone-400 mt-1.5">Enter your new password below.</p>
              </div>
              {error && <div role="alert" className="mb-4 rounded-xl bg-red-500/20 border border-red-500/30 lg:bg-red-50 lg:border-red-200 px-4 py-3.5 text-xs text-red-200 lg:text-red-800">{error}</div>}
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 border-white/20 lg:border-stone-200"
                    placeholder="At least 8 characters" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    className="w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 border-white/20 lg:border-stone-200"
                    placeholder="Repeat your password" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-amber-500 text-sm font-bold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60 transition-all shadow-sm mt-1">
                  {loading ? 'Resetting…' : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
        <div className="relative z-10 px-8 sm:px-12 lg:px-10 xl:px-14 pb-8">
          <p className="text-[11px] text-stone-400 text-center">&copy; {new Date().getFullYear()} Northern Negros Electric Cooperative, Inc. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}
