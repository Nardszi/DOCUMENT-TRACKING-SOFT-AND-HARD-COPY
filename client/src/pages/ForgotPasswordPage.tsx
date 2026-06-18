import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function ForgotPasswordPage() {
  useDocumentTitle('Forgot Password')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await fetch('/api/auth/reset-password-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      setSubmitted(true)
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
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
            <h1 className="text-[2.6rem] font-extrabold text-white leading-[1.1] mb-6">Forgot Your Password?</h1>
            <p className="text-sm text-stone-400 leading-relaxed max-w-xs">Enter your email and we'll send you a reset link to regain access.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-700" />
            <p className="text-[10px] text-stone-600 tracking-widest uppercase whitespace-nowrap">NEA · PHILRECA · APEC</p>
            <div className="h-px flex-1 bg-stone-700" />
          </div>
        </div>
      </div>
      <div className="relative flex flex-col w-full lg:w-[480px] flex-shrink-0 bg-[#1a1a1a] lg:bg-white overflow-hidden">
        <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-[#0d0d0d] via-[#1a1a1a] to-stone-900 pointer-events-none" />
        <div className="relative z-10 h-[3px] bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
        <div className="relative z-10 flex-1 flex flex-col justify-center px-8 sm:px-12 lg:px-10 xl:px-14 py-12">
          <div className="flex items-center gap-4 mb-8">
            <img src="/noneco-logo.png" alt="NONECO Logo" className="w-12 h-12 object-contain flex-shrink-0" />
            <div className="border-l border-white/20 lg:border-stone-200 pl-4">
              <p className="text-sm font-bold text-amber-400 lg:text-stone-900 leading-tight tracking-wide">NONECO</p>
              <p className="text-[11px] text-stone-300 lg:text-stone-400 leading-tight mt-0.5">Northern Negros Electric Cooperative</p>
            </div>
          </div>
          {submitted ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white lg:text-stone-900 mb-2">Check Your Email</h2>
              <p className="text-sm text-stone-300 lg:text-stone-500">If an account with that email exists, you'll receive a password reset link shortly.</p>
              <Link to="/login" className="mt-6 inline-block text-sm text-amber-500 hover:text-amber-400 font-semibold">Back to Sign In</Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-[1.6rem] font-bold text-white lg:text-stone-900 tracking-tight leading-tight">Reset Password</h2>
                <p className="text-sm text-stone-300 lg:text-stone-400 mt-1.5">Enter your registered email address.</p>
              </div>
              {error && <div role="alert" className="mb-4 rounded-xl bg-red-500/20 border border-red-500/30 lg:bg-red-50 lg:border-red-200 px-4 py-3.5 text-xs text-red-200 lg:text-red-800">{error}</div>}
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 border-white/20 lg:border-stone-200"
                    placeholder="you@example.com" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-amber-500 text-sm font-bold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60 transition-all shadow-sm mt-1">
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
              <p className="mt-6 text-center text-xs text-stone-400">
                <Link to="/login" className="text-amber-500 hover:text-amber-400 font-semibold">Back to Sign In</Link>
              </p>
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
