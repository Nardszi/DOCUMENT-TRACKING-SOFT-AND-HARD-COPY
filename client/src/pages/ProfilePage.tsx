import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ToastContainer'

interface FormState {
  current_password: string
  new_password: string
  confirm_password: string
}
interface FormErrors {
  current_password?: string
  new_password?: string
  confirm_password?: string
}
const INITIAL_FORM: FormState = { current_password: '', new_password: '', confirm_password: '' }

function formatRole(role: string) {
  return role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

const ROLE_CONFIG: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  admin:           { label: 'Administrator',    bg: 'bg-violet-500/15', text: 'text-violet-300', ring: 'ring-violet-500/30' },
  department_head: { label: 'Department Head',  bg: 'bg-amber-500/15',  text: 'text-amber-300',  ring: 'ring-amber-500/30' },
  staff:           { label: 'Staff',            bg: 'bg-sky-500/15',    text: 'text-sky-300',    ring: 'ring-sky-500/30' },
}

function PasswordField({
  id, label, value, onChange, error, autoComplete,
}: {
  id: string; label: string; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string; autoComplete: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id} name={id} type={show ? 'text' : 'password'}
          value={value} onChange={onChange} autoComplete={autoComplete}
          aria-invalid={!!error}
          className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-stone-50 dark:bg-stone-700/60 focus:bg-white dark:focus:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all pr-11 dark:text-stone-100 placeholder:text-stone-400 ${
            error
              ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600'
              : 'border-stone-200 dark:border-stone-600'
          }`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center px-3.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 focus:outline-none transition-colors"
        >
          {show ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const { user, token } = useAuth()
  const { showToast } = useToast()

  const [departmentName, setDepartmentName] = useState('')
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token || !user?.departmentId) return
    fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((depts: { id: number | string; name: string }[]) => {
        const dept = Array.isArray(depts) ? depts.find((d) => String(d.id) === String(user.departmentId)) : null
        if (dept) setDepartmentName(dept.name)
      })
      .catch(() => {})
  }, [token, user?.departmentId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm((p) => ({ ...p, [name]: value }))
    setErrors((p) => ({ ...p, [name]: undefined }))
    setSuccess(false)
  }

  const validate = (): boolean => {
    const e: FormErrors = {}
    if (!form.current_password) e.current_password = 'Current password is required'
    if (!form.new_password) e.new_password = 'New password is required'
    else if (form.new_password.length < 8) e.new_password = 'Must be at least 8 characters'
    if (!form.confirm_password) e.confirm_password = 'Please confirm your new password'
    else if (form.new_password !== form.confirm_password) e.confirm_password = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }),
      })
      if (res.ok) {
        showToast('Password changed successfully', 'success')
        setForm(INITIAL_FORM)
        setErrors({})
        setSuccess(true)
        return
      }
      const data = await res.json().catch(() => ({}))
      const code = data?.error?.code
      const message = data?.error?.message
      if (code === 'INVALID_PASSWORD') setErrors({ current_password: message || 'Current password is incorrect' })
      else if (code === 'PASSWORD_TOO_SHORT') setErrors({ new_password: message || 'Must be at least 8 characters' })
      else showToast(message || 'Failed to change password.', 'error')
    } catch {
      showToast('Unable to connect. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const initials = user?.fullName ? getInitials(user.fullName) : '?'
  const roleCfg = ROLE_CONFIG[user?.role ?? 'staff'] ?? ROLE_CONFIG.staff

  // Password strength
  const pwLen = form.new_password.length
  const pwStrength = pwLen === 0 ? 0 : pwLen < 8 ? 1 : pwLen < 12 ? 2 : pwLen < 16 ? 3 : 4
  const pwLabel = ['', 'Too short', 'Fair', 'Good', 'Strong'][pwStrength]
  const pwColor = ['', 'bg-red-400', 'bg-amber-400', 'bg-sky-400', 'bg-emerald-500'][pwStrength]

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">

      {/* ── Standard top banner (matches all other pages) ── */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-bold text-white tracking-tight">My Profile</h1>
          <p className="text-stone-400 text-sm mt-0.5">Account information and security settings</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── LEFT: Identity card ── */}
          <div className="lg:col-span-1 flex flex-col gap-5">

            {/* Avatar card */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
              {/* Coloured top strip */}
              <div className="h-16 bg-gradient-to-r from-stone-800 to-stone-700 dark:from-stone-900 dark:to-stone-800" />

              {/* Avatar — overlaps the strip */}
              <div className="px-6 pb-5">
                <div className="-mt-8 mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg ring-4 ring-white dark:ring-stone-800">
                    <span className="text-xl font-bold text-white tracking-tight select-none">{initials}</span>
                  </div>
                </div>

                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight">
                  {user?.fullName || '—'}
                </h2>

                {user?.role && (
                  <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${roleCfg.bg} ${roleCfg.text} ${roleCfg.ring}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                    {roleCfg.label}
                  </span>
                )}
              </div>
            </div>

            {/* Account details card */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
              <div className="px-5 py-3.5 border-b border-stone-100 dark:border-stone-700">
                <p className="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Account Details</p>
              </div>
              <dl className="divide-y divide-stone-100 dark:divide-stone-700/60">
                {[
                  {
                    label: 'Full Name',
                    value: user?.fullName || '—',
                    icon: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ),
                  },
                  {
                    label: 'Role',
                    value: user?.role ? formatRole(user.role) : '—',
                    icon: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    ),
                  },
                  {
                    label: 'Department',
                    value: departmentName || '—',
                    icon: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    ),
                  },
                ].map(({ label, value, icon }) => (
                  <div key={label} className="flex items-center gap-3 px-5 py-3">
                    <span className="text-stone-400 dark:text-stone-500 flex-shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate mt-0.5">{value}</p>
                    </div>
                  </div>
                ))}
              </dl>
              <div className="px-5 py-3 border-t border-stone-100 dark:border-stone-700">
                <p className="text-[11px] text-stone-400 dark:text-stone-500">
                  Account details are managed by your administrator.
                </p>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Security / Change password ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
              <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-700 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Change Password</h2>
                  <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Use a strong password of at least 8 characters</p>
                </div>
              </div>

              <div className="px-6 py-5">
                {success && (
                  <div className="mb-5 flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 dark:bg-emerald-900/20 dark:border-emerald-800/40">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Password updated successfully.</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <PasswordField
                    id="current_password" label="Current Password"
                    value={form.current_password} onChange={handleChange}
                    error={errors.current_password} autoComplete="current-password"
                  />

                  <div className="pt-1 border-t border-stone-100 dark:border-stone-700/60" />

                  <PasswordField
                    id="new_password" label="New Password"
                    value={form.new_password} onChange={handleChange}
                    error={errors.new_password} autoComplete="new-password"
                  />

                  {/* Strength meter */}
                  {pwLen > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              i <= pwStrength ? pwColor : 'bg-stone-200 dark:bg-stone-600'
                            }`}
                          />
                        ))}
                      </div>
                      <p className={`text-xs font-medium ${
                        pwStrength === 1 ? 'text-red-500' :
                        pwStrength === 2 ? 'text-amber-500' :
                        pwStrength === 3 ? 'text-sky-500' : 'text-emerald-500'
                      }`}>
                        {pwLabel}
                      </p>
                    </div>
                  )}

                  <PasswordField
                    id="confirm_password" label="Confirm New Password"
                    value={form.confirm_password} onChange={handleChange}
                    error={errors.confirm_password} autoComplete="new-password"
                  />

                  {/* Requirements hint */}
                  <div className="rounded-xl bg-stone-50 dark:bg-stone-700/40 border border-stone-200 dark:border-stone-700 px-4 py-3 space-y-1.5">
                    <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">Requirements</p>
                    {[
                      { met: pwLen >= 8,  text: 'At least 8 characters' },
                      { met: /[A-Z]/.test(form.new_password), text: 'One uppercase letter' },
                      { met: /[0-9]/.test(form.new_password), text: 'One number' },
                    ].map(({ met, text }) => (
                      <div key={text} className="flex items-center gap-2">
                        <svg
                          className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${met ? 'text-emerald-500' : 'text-stone-300 dark:text-stone-600'}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className={`text-xs transition-colors ${met ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400 dark:text-stone-500'}`}>
                          {text}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                      {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Updating…
                        </span>
                      ) : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
