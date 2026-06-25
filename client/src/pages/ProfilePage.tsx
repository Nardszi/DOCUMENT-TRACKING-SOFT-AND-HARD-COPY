import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ToastContainer'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiQuery } from '../hooks/useApi'

interface FormState { current_password: string; new_password: string; confirm_password: string }
interface FormErrors { current_password?: string; new_password?: string; confirm_password?: string }
const INITIAL_FORM: FormState = { current_password: '', new_password: '', confirm_password: '' }

interface ActivityItem { id: string; title: string; tracking_number: string; status: string; priority: string; created_at: string }
interface ProfileData { created_at: string }

function getInitials(name: string) { return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') }
function formatRole(role: string) { return role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  department_head: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  staff: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  forwarded: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  returned: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

type Tab = 'account' | 'security' | 'activity'

function formatDate(iso: string) {
  const d = new Date(iso); const now = new Date(); const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function PasswordField({ id, label, value, onChange, error, autoComplete }: { id: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; error?: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">{label}</label>
      <div className="relative">
        <input id={id} name={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} aria-invalid={!!error}
          className={`w-full rounded-xl border px-4 py-2.5 text-sm bg-stone-50 dark:bg-stone-700/60 focus:bg-white dark:focus:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all pr-11 dark:text-stone-100 placeholder:text-stone-400 ${error ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600' : 'border-stone-200 dark:border-stone-600'}`} />
        <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide' : 'Show'} className="absolute inset-y-0 right-0 flex items-center px-3.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">
          {show ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export default function ProfilePage() {
  useDocumentTitle('Profile')
  const { user, token, login } = useAuth()
  const { showToast } = useToast()

  const { data: departments = [] } = useApiQuery<{ id: string; name: string }[]>('/api/departments', { retry: false })
  const deptName = departments.find(d => String(d.id) === String(user?.departmentId))?.name || '—'

  const { data: profileData } = useApiQuery<{ user: ProfileData }>('/api/profile', { retry: false })
  const memberSince = profileData?.user?.created_at
    ? new Date(profileData.user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—'

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    if (!token || !user || activeTab !== 'activity') return
    setActivityLoading(true)
    const params = new URLSearchParams({ created_by: String(user.id), limit: '10', page: '1' })
    fetch(`/api/documents?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { data: [] }).then(data => setActivity(Array.isArray(data.data) ? data.data : []))
      .catch(() => {}).finally(() => setActivityLoading(false))
  }, [token, user, activeTab])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value })); setErrors(p => ({ ...p, [name]: undefined })); setSuccess(false)
  }

  const validate = (): boolean => {
    const e: FormErrors = {}
    if (!form.current_password) e.current_password = 'Required'
    if (!form.new_password) e.new_password = 'Required'
    else if (form.new_password.length < 8) e.new_password = 'Min 8 characters'
    if (!form.confirm_password) e.confirm_password = 'Required'
    else if (form.new_password !== form.confirm_password) e.confirm_password = 'No match'
    setErrors(e); return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!validate()) return; setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ current_password: form.current_password, new_password: form.new_password }) })
      if (res.ok) { showToast('Password changed', 'success'); setForm(INITIAL_FORM); setErrors({}); setSuccess(true); return }
      const data = await res.json().catch(() => ({}))
      const code = data?.error?.code; const msg = data?.error?.message
      if (code === 'INVALID_PASSWORD') setErrors({ current_password: msg || 'Incorrect password' })
      else showToast(msg || 'Failed.', 'error')
    } catch { showToast('Connection failed.', 'error') } finally { setSubmitting(false) }
  }

  const initials = user?.fullName ? getInitials(user.fullName) : '?'
  const roleColor = ROLE_COLORS[user?.role ?? 'staff'] ?? ROLE_COLORS.staff
  const pwLen = form.new_password.length
  const pwStrength = pwLen === 0 ? 0 : pwLen < 8 ? 1 : pwLen < 12 ? 2 : pwLen < 16 ? 3 : 4
  const pwLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][pwStrength]
  const pwColor = ['', 'bg-red-400', 'bg-amber-400', 'bg-sky-400', 'bg-emerald-500'][pwStrength]

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">My Profile</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Account information and security settings</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Identity card */}
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden lg:sticky lg:top-24">
              {/* Banner */}
              <div className="h-16 bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-700" />
              <div className="px-5 pb-5 -mt-8">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg ring-4 ring-white dark:ring-stone-900">
                  <span className="text-xl font-bold text-white select-none">{initials}</span>
                </div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100 mt-2 leading-tight">{user?.fullName || '—'}</h2>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold mt-1.5 ${roleColor}`}>
                  {formatRole(user?.role ?? 'staff')}
                </span>

                {/* Info rows */}
                <div className="mt-5 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-3">
                  {[
                    { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>, label: 'Department', value: deptName },
                    { icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>, label: 'Member Since', value: memberSince },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 text-stone-400 dark:text-stone-500">{row.icon}</div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">{row.label}</p>
                        <p className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">{row.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Tabbed content */}
          <div className="lg:col-span-8">
            {/* Segmented tabs */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 mb-5">
              {([
                { key: 'account' as Tab, label: 'Account', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
                { key: 'security' as Tab, label: 'Security', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
                { key: 'activity' as Tab, label: 'Activity', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
              ]).map(({ key, label, icon }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${activeTab === key ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}>
                  {icon}{label}
                </button>
              ))}
            </div>

            <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5">

              {/* Account tab */}
              {activeTab === 'account' && (
                <div>
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">Personal Information</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">Manage your display name.</p>
                  {!editingName ? (
                    <div className="flex items-center justify-between p-4 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700">
                      <div>
                        <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">Full Name</p>
                        <p className="text-base font-semibold text-stone-900 dark:text-stone-100 mt-0.5">{user?.fullName}</p>
                      </div>
                      <button onClick={() => { setNameValue(user?.fullName || ''); setEditingName(true) }}
                        className="px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 transition-colors shadow-sm">Edit</button>
                    </div>
                  ) : (
                    <form onSubmit={async (e) => {
                      e.preventDefault(); if (!nameValue.trim()) return; setSavingName(true)
                      try {
                        const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ full_name: nameValue.trim() }) })
                        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || 'Failed to update.') }
                        const data = await res.json(); if (data.token) login(data.token)
                        showToast('Name updated', 'success'); setEditingName(false)
                      } catch (err) { showToast(err instanceof Error ? err.message : 'Failed to update.', 'error') } finally { setSavingName(false) }
                    }} className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 space-y-3">
                      <input type="text" value={nameValue} onChange={e => setNameValue(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 dark:border-stone-600 px-4 py-2.5 text-sm bg-white dark:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:text-stone-100" autoFocus />
                      <div className="flex gap-2">
                        <button type="submit" disabled={savingName || !nameValue.trim()} className="px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 shadow-sm">{savingName ? 'Saving…' : 'Save'}</button>
                        <button type="button" onClick={() => setEditingName(false)} className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-600 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700">Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Security tab */}
              {activeTab === 'security' && (
                <div>
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">Change Password</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">Use a strong password of at least 8 characters.</p>
                  {success && (
                    <div className="mb-4 flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 dark:bg-emerald-900/20 dark:border-emerald-800/40">
                      <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Password updated.</p>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} noValidate className="max-w-lg space-y-4">
                    <PasswordField id="current_password" label="Current Password" value={form.current_password} onChange={handleChange} error={errors.current_password} autoComplete="current-password" />
                    <div className="border-t border-stone-100 dark:border-stone-800" />
                    <PasswordField id="new_password" label="New Password" value={form.new_password} onChange={handleChange} error={errors.new_password} autoComplete="new-password" />
                    {pwLen > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1">{[1, 2, 3, 4].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= pwStrength ? pwColor : 'bg-stone-200 dark:bg-stone-700'}`} />)}</div>
                        <p className={`text-xs font-medium ${pwStrength === 1 ? 'text-red-500' : pwStrength === 2 ? 'text-amber-500' : pwStrength === 3 ? 'text-sky-500' : 'text-emerald-500'}`}>{pwLabel}</p>
                      </div>
                    )}
                    <PasswordField id="confirm_password" label="Confirm New Password" value={form.confirm_password} onChange={handleChange} error={errors.confirm_password} autoComplete="new-password" />
                    <div className="rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 px-4 py-3 space-y-1.5">
                      <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider">Requirements</p>
                      {[
                        { met: pwLen >= 8, text: 'At least 8 characters' },
                        { met: /[A-Z]/.test(form.new_password), text: 'One uppercase letter' },
                        { met: /[0-9]/.test(form.new_password), text: 'One number' },
                      ].map(({ met, text }) => (
                        <div key={text} className="flex items-center gap-2">
                          <svg className={`w-3.5 h-3.5 shrink-0 ${met ? 'text-emerald-500' : 'text-stone-300 dark:text-stone-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          <span className={`text-xs ${met ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400 dark:text-stone-500'}`}>{text}</span>
                        </div>
                      ))}
                    </div>
                    <button type="submit" disabled={submitting}
                      className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-600 text-sm font-bold text-white disabled:opacity-60 transition-colors shadow-sm">
                      {submitting ? 'Updating…' : 'Update Password'}
                    </button>
                  </form>
                </div>
              )}

              {/* Activity tab */}
              {activeTab === 'activity' && (
                <div>
                  <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">Recent Documents</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">Documents you have created.</p>
                  {activityLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-stone-100 dark:bg-stone-800 animate-pulse" />)}</div>
                  ) : activity.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <p className="text-sm text-stone-500 dark:text-stone-400">No documents yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activity.map(item => (
                        <a key={item.id} href={`/documents/${item.id}`}
                          className="block p-3 rounded-xl border border-stone-100 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors group">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500">{item.tracking_number}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[item.status] || 'bg-stone-100 text-stone-600'}`}>{item.status.replace(/_/g, ' ')}</span>
                              </div>
                              <p className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">{item.title}</p>
                            </div>
                            <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">{formatDate(item.created_at)}</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
