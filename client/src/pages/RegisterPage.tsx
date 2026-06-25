import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Skeleton from '../components/Skeleton'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface Department { id: number; code: string; name: string }

export default function RegisterPage() {
  useDocumentTitle('Register')
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<Department[]>([])
  const [form, setForm] = useState({ username: '', password: '', confirm_password: '', email: '', full_name: '', department_id: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/departments')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => setApiError('Failed to load departments.'))
      .finally(() => setLoading(false))
  }, [])

  const validateField = (name: string, value: string): string => {
    switch (name) {
      case 'username': return !value.trim() ? 'Username is required' : ''
      case 'full_name': return !value.trim() ? 'Full name is required' : ''
      case 'email': return !value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'Valid email is required' : ''
      case 'department_id': return !value ? 'Department is required' : ''
      case 'password': return !value ? 'Password is required' : value.length < 8 ? 'Must be at least 8 characters' : ''
      case 'confirm_password': return !value ? 'Please confirm your password' : form.password !== value ? 'Passwords do not match' : ''
      default: return ''
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.username.trim()) e.username = 'Username is required'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Must be at least 8 characters'
    if (!form.confirm_password) e.confirm_password = 'Please confirm your password'
    else if (form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email is required'
    if (!form.full_name.trim()) e.full_name = 'Full name is required'
    if (!form.department_id) e.department_id = 'Department is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          password: form.password,
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          department_id: form.department_id,
        }),
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json().catch(() => ({}))
        setApiError(data?.error?.message || 'Registration failed. Please try again.')
      }
    } catch {
      setApiError('Unable to connect. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <div className="w-full max-w-md mx-auto px-4 space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-white dark:bg-stone-950">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden bg-[#1a1a1a]">
        <div className="absolute inset-0 bg-cover bg-center opacity-60"
          style={{ backgroundImage: "url('/noneco-banner.jpg')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#111111]/85 via-[#1a1a1a]/60 to-[#1a1a1a]/40" />
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-500 to-amber-600" />
        <div className="relative z-10 flex flex-col h-full px-14 py-12">
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-[0.3em] mb-5">Document Tracking System</p>
            <h1 className="text-[2.6rem] font-extrabold text-white leading-[1.1] mb-6">
              Create Your Account
            </h1>
            <p className="text-sm text-stone-400 leading-relaxed mb-10 max-w-xs">
              Register to start tracking and managing documents across departments.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-700" />
            <p className="text-[10px] text-stone-600 tracking-widest uppercase whitespace-nowrap">NEA · PHILRECA · APEC</p>
            <div className="h-px flex-1 bg-stone-700" />
          </div>
        </div>
      </div>

      {/* Right panel */}
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
              <h2 className="text-xl font-bold text-white lg:text-stone-900 mb-2">Account Created!</h2>
              <p className="text-sm text-stone-300 lg:text-stone-500 mb-6">You can now sign in with your credentials.</p>
              <button onClick={() => navigate('/login')}
                className="w-full min-h-[44px] rounded-xl bg-amber-500 text-sm font-bold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all shadow-sm">
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-[1.6rem] font-bold text-white lg:text-stone-900 tracking-tight leading-tight">Create Account</h2>
                <p className="text-sm text-stone-300 lg:text-stone-400 mt-1.5">Fill in the details to register</p>
              </div>

              {apiError && (
                <div role="alert" className="mb-4 rounded-xl bg-red-500/20 border border-red-500/30 lg:bg-red-50 lg:border-red-200 px-4 py-3.5 text-xs text-red-200 lg:text-red-800">{apiError}</div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Username</label>
                  <input name="username" type="text" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} onBlur={handleBlur}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 ${errors.username ? 'border-red-400' : 'border-white/20 lg:border-stone-200'}`}
                    placeholder="Choose a username" />
                  {errors.username && <p className="mt-1 text-xs text-red-300 lg:text-red-600">{errors.username}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Full Name</label>
                  <input name="full_name" type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} onBlur={handleBlur}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 ${errors.full_name ? 'border-red-400' : 'border-white/20 lg:border-stone-200'}`}
                    placeholder="Enter your full name" />
                  {errors.full_name && <p className="mt-1 text-xs text-red-300 lg:text-red-600">{errors.full_name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Email</label>
                  <input name="email" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} onBlur={handleBlur}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 ${errors.email ? 'border-red-400' : 'border-white/20 lg:border-stone-200'}`}
                    placeholder="email@example.com" />
                  {errors.email && <p className="mt-1 text-xs text-red-300 lg:text-red-600">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Department</label>
                  <select name="department_id" value={form.department_id} onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))} onBlur={handleBlur}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-300 ${errors.department_id ? 'border-red-400' : 'border-white/20 lg:border-stone-200'}`}>
                    <option value="">Select department…</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                  </select>
                  {errors.department_id && <p className="mt-1 text-xs text-red-300 lg:text-red-600">{errors.department_id}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Password</label>
                  <input name="password" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} onBlur={handleBlur}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 ${errors.password ? 'border-red-400' : 'border-white/20 lg:border-stone-200'}`}
                    placeholder="At least 8 characters" />
                  {errors.password && <p className="mt-1 text-xs text-red-300 lg:text-red-600">{errors.password}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-300 lg:text-stone-500 uppercase tracking-widest mb-1.5">Confirm Password</label>
                  <input name="confirm_password" type="password" value={form.confirm_password} onChange={e => setForm(p => ({ ...p, confirm_password: e.target.value }))} onBlur={handleBlur}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-white/10 lg:bg-stone-50 text-white lg:text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 ${errors.confirm_password ? 'border-red-400' : 'border-white/20 lg:border-stone-200'}`}
                    placeholder="Repeat your password" />
                  {errors.confirm_password && <p className="mt-1 text-xs text-red-300 lg:text-red-600">{errors.confirm_password}</p>}
                </div>

                <button type="submit" disabled={submitting}
                  className="w-full min-h-[44px] rounded-xl bg-amber-500 text-sm font-bold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 transition-all shadow-sm mt-1">
                  {submitting ? 'Creating Account…' : 'Create Account'}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-stone-400">
                Already have an account?{' '}
                <a href="/login" className="text-amber-500 hover:text-amber-400 font-semibold">Sign in</a>
              </p>
            </>
          )}
        </div>

        <div className="relative z-10 px-8 sm:px-12 lg:px-10 xl:px-14 pb-8">
          <p className="text-[11px] text-stone-400 text-center">
            &copy; {new Date().getFullYear()} Northern Negros Electric Cooperative, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
