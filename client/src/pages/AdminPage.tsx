import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiQuery } from '../hooks/useApi'

type Role = 'staff' | 'department_head' | 'admin'

interface Department { id: string; code: string; name: string }
interface User { id: string; username: string; email: string; full_name: string; role: Role; department_id: string; is_active: boolean }
interface Category { id: string; name: string; is_active: boolean }
interface Template { id: string; name: string; title_prefix: string; category_id: string; originating_department_id: string; description: string; priority: 'low' | 'normal' | 'high' | 'urgent'; is_active: boolean; created_by: string; created_at: string; updated_at: string }

const ROLE_LABELS: Record<Role, string> = { staff: 'Staff', department_head: 'Dept. Head', admin: 'Admin' }
const ROLE_COLORS: Record<Role, string> = {
  staff: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400',
  department_head: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}
const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  normal: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400',
  low: 'bg-stone-50 text-stone-400 dark:bg-stone-800 dark:text-stone-500',
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400'}`}><span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-stone-400'}`} />{active ? 'Active' : 'Inactive'}</span>
}

function inputCls(hasError: boolean) {
  return `w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 ${hasError ? 'border-red-400 dark:border-red-600' : 'border-stone-200 dark:border-stone-600'}`
}

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

// ─── User Modal ──────────────────────────────────────────────────────────────

interface UserFormData { username: string; password: string; email: string; full_name: string; role: Role; department_id: string }
const EMPTY_USER_FORM: UserFormData = { username: '', password: '', email: '', full_name: '', role: 'staff', department_id: '' }

function UserModal({ editUser, departments, token, onSaved, onClose }: { editUser: User | null; departments: Department[]; token: string; onSaved: () => void; onClose: () => void }) {
  const isEdit = !!editUser
  const [form, setForm] = useState<UserFormData>(() => isEdit ? { username: editUser.username, password: '', email: editUser.email, full_name: editUser.full_name, role: editUser.role, department_id: editUser.department_id } : EMPTY_USER_FORM)
  const [errors, setErrors] = useState<Partial<UserFormData>>({})
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  const validate = (): boolean => {
    const e: Partial<UserFormData> = {}
    if (!isEdit && !form.username.trim()) e.username = 'Required'
    if (!isEdit && form.password.length < 8) e.password = 'Min 8 characters'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email required'
    if (!form.full_name.trim()) e.full_name = 'Required'
    if (!form.department_id) e.department_id = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true); setApiError('')
    try {
      const url = isEdit ? `/api/users/${editUser!.id}` : '/api/users'
      const body: Record<string, string> = { email: form.email.trim(), full_name: form.full_name.trim(), role: form.role, department_id: form.department_id }
      if (!isEdit) { body.username = form.username.trim(); body.password = form.password }
      const res = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
      if (res.ok) { onSaved(); return }
      const data = await res.json().catch(() => ({})); setApiError(data?.error?.message || 'Failed to save user.')
    } catch { setApiError('Unable to connect.') } finally { setSaving(false) }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-stone-200 p-6 max-h-[90vh] overflow-y-auto dark:bg-stone-800 dark:border-stone-700">
        <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-5">{isEdit ? 'Edit User' : 'Add User'}</h2>
        {apiError && <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{apiError}</div>}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {!isEdit && <Field label="Username" id="um-user" error={errors.username}><input id="um-user" type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className={inputCls(!!errors.username)} /></Field>}
          {!isEdit && <Field label="Password" id="um-pass" error={errors.password}><input id="um-pass" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls(!!errors.password)} /></Field>}
          <Field label="Full Name" id="um-name" error={errors.full_name}><input id="um-name" type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls(!!errors.full_name)} /></Field>
          <Field label="Email" id="um-email" error={errors.email}><input id="um-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls(!!errors.email)} /></Field>
          <Field label="Role" id="um-role" error={undefined}>
            <select id="um-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} className={inputCls(false)}>
              <option value="staff">Staff</option><option value="department_head">Department Head</option><option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Department" id="um-dept" error={errors.department_id}>
            <select id="um-dept" value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))} className={inputCls(!!errors.department_id)}>
              <option value="">Select department…</option>{departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" onClick={onClose} className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 shadow-sm">{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Category Modal ──────────────────────────────────────────────────────────

function CategoryModal({ editCategory, token, onSaved, onClose }: { editCategory: Category | null; token: string; onSaved: () => void; onClose: () => void }) {
  const isEdit = !!editCategory
  const [name, setName] = useState(editCategory?.name ?? '')
  const [nameError, setNameError] = useState('')
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setNameError('Required'); return }
    setNameError(''); setSaving(true); setApiError('')
    try {
      const res = await fetch(isEdit ? `/api/categories/${editCategory!.id}` : '/api/categories', { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: name.trim() }) })
      if (res.ok) { onSaved(); return }
      const data = await res.json().catch(() => ({})); setApiError(data?.error?.message || 'Failed to save.')
    } catch { setApiError('Unable to connect.') } finally { setSaving(false) }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-stone-200 p-6 dark:bg-stone-800 dark:border-stone-700">
        <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-5">{isEdit ? 'Rename Category' : 'Add Category'}</h2>
        {apiError && <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{apiError}</div>}
        <form onSubmit={handleSubmit} noValidate>
          <Field label="Category Name" id="cat-name" error={nameError}><input id="cat-name" type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls(!!nameError)} autoFocus /></Field>
          <div className="flex justify-end gap-2.5 mt-5">
            <button type="button" onClick={onClose} className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 shadow-sm">{saving ? 'Saving…' : isEdit ? 'Rename' : 'Add Category'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Template Modal ──────────────────────────────────────────────────────────

interface TemplateFormData { name: string; title_prefix: string; category_id: string; originating_department_id: string; description: string; priority: 'low' | 'normal' | 'high' | 'urgent' }
const EMPTY_TMPL: TemplateFormData = { name: '', title_prefix: '', category_id: '', originating_department_id: '', description: '', priority: 'normal' }

function TemplateModal({ editTemplate, categories, departments, token, onSaved, onClose }: { editTemplate: Template | null; categories: Category[]; departments: Department[]; token: string; onSaved: () => void; onClose: () => void }) {
  const isEdit = !!editTemplate
  const [form, setForm] = useState<TemplateFormData>(() => isEdit ? { name: editTemplate.name, title_prefix: editTemplate.title_prefix, category_id: editTemplate.category_id ?? '', originating_department_id: editTemplate.originating_department_id ?? '', description: editTemplate.description ?? '', priority: editTemplate.priority } : EMPTY_TMPL)
  const [nameError, setNameError] = useState('')
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setNameError('Required'); return }
    setNameError(''); setSaving(true); setApiError('')
    try {
      const res = await fetch(isEdit ? `/api/templates/${editTemplate!.id}` : '/api/templates', { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...form, name: form.name.trim(), title_prefix: form.title_prefix.trim(), description: form.description.trim(), category_id: form.category_id || null, originating_department_id: form.originating_department_id || null }) })
      if (res.ok) { onSaved(); return }
      const data = await res.json().catch(() => ({})); setApiError(data?.error?.message || 'Failed to save.')
    } catch { setApiError('Unable to connect.') } finally { setSaving(false) }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-stone-200 p-6 max-h-[90vh] overflow-y-auto dark:bg-stone-800 dark:border-stone-700">
        <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-5">{isEdit ? 'Edit Template' : 'Create Template'}</h2>
        {apiError && <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{apiError}</div>}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field label="Template Name" id="t-name" error={nameError}><input id="t-name" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls(!!nameError)} autoFocus /></Field>
          <Field label="Title Prefix" id="t-prefix" error={undefined}><input id="t-prefix" type="text" value={form.title_prefix} onChange={e => setForm(f => ({ ...f, title_prefix: e.target.value }))} className={inputCls(false)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" id="t-cat" error={undefined}>
              <select id="t-cat" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className={inputCls(false)}>
                <option value="">— None —</option>{categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Priority" id="t-pri" error={undefined}>
              <select id="t-pri" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TemplateFormData['priority'] }))} className={inputCls(false)}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>
          <Field label="Originating Department" id="t-dept" error={undefined}>
            <select id="t-dept" value={form.originating_department_id} onChange={e => setForm(f => ({ ...f, originating_department_id: e.target.value }))} className={inputCls(false)}>
              <option value="">— None —</option>{departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </Field>
          <Field label="Description" id="t-desc" error={undefined}><textarea id="t-desc" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls(false)} /></Field>
          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" onClick={onClose} className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200">Cancel</button>
            <button type="submit" disabled={saving} className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 shadow-sm">{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── User Management ─────────────────────────────────────────────────────────

function UserManagement({ token, departments }: { token: string; departments: Department[] }) {
  const { data: users = [], refetch } = useApiQuery<User[]>('/api/users', { retry: false })
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [search, setSearch] = useState('')

  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d.code])), [departments])
  const filtered = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(u => u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, search])

  const handleSaved = () => { refetch(); setModalOpen(false); setEditUser(null) }
  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    try { await fetch(`/api/users/${deactivateTarget.id}/deactivate`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }); refetch() } catch {} finally { setDeactivateTarget(null) }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <button onClick={() => { setEditUser(null); setModalOpen(true) }} className="px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 shadow-sm shrink-0">+ Add User</button>
      </div>

      {/* Mobile */}
      <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-700/60 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
        {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-stone-400">{search ? 'No users match your search.' : 'No users found.'}</li>}
        {filtered.map(u => (
          <li key={u.id} className="px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{u.full_name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                  <StatusDot active={u.is_active} />
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">@{u.username} · {u.email}</p>
                <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">{deptMap[u.department_id] ?? '—'}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => { setEditUser(u); setModalOpen(true) }} className="px-2.5 py-1 rounded-lg border border-stone-200 text-[11px] font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300">Edit</button>
                <button disabled={!u.is_active} onClick={() => setDeactivateTarget(u)} className="px-2.5 py-1 rounded-lg border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800/40 dark:text-red-400">Deactivate</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="min-w-full divide-y divide-stone-100 dark:divide-stone-700 text-sm">
          <thead className="bg-stone-50 dark:bg-stone-800">
            <tr>{['Name', 'Username', 'Email', 'Role', 'Dept', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider dark:text-stone-400">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
            {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-stone-400">{search ? 'No users match.' : 'No users.'}</td></tr>}
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
                <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 whitespace-nowrap">{u.full_name}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{u.username}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{u.email}</td>
                <td className="px-4 py-3 whitespace-nowrap"><span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span></td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{deptMap[u.department_id] ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusDot active={u.is_active} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex gap-2">
                    <button onClick={() => { setEditUser(u); setModalOpen(true) }} className="px-2.5 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300">Edit</button>
                    <button disabled={!u.is_active} onClick={() => setDeactivateTarget(u)} className="px-2.5 py-1 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800/40 dark:text-red-400">Deactivate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && <UserModal editUser={editUser} departments={departments} token={token} onSaved={handleSaved} onClose={() => { setModalOpen(false); setEditUser(null) }} />}
      {deactivateTarget && <ConfirmDialog title="Deactivate User" message={`Deactivate "${deactivateTarget.full_name}"? They will no longer be able to log in.`} confirmLabel="Deactivate" onConfirm={handleDeactivate} onCancel={() => setDeactivateTarget(null)} danger />}
    </div>
  )
}

// ─── Category Management ─────────────────────────────────────────────────────

function CategoryManagement({ token }: { token: string }) {
  const { data: categories = [], refetch } = useApiQuery<Category[]>('/api/categories', { retry: false })
  const [modalOpen, setModalOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return categories
    return categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  }, [categories, search])

  const activeCount = categories.filter(c => c.is_active).length

  const handleSaved = () => { refetch(); setModalOpen(false); setEditCategory(null) }
  const handleToggle = async (cat: Category) => { await fetch(`/api/categories/${cat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_active: !cat.is_active }) }); refetch() }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search categories…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <span className="text-xs text-stone-400 shrink-0">{activeCount} active</span>
        <button onClick={() => { setEditCategory(null); setModalOpen(true) }} className="px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 shadow-sm shrink-0">+ Add Category</button>
      </div>

      <ul className="divide-y divide-stone-100 dark:divide-stone-700/60 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
        {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-stone-400">{search ? 'No categories match.' : 'No categories.'}</li>}
        {filtered.map(cat => (
          <li key={cat.id} className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{cat.name}</span>
              <StatusDot active={cat.is_active} />
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { setEditCategory(cat); setModalOpen(true) }} className="px-2.5 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300">Rename</button>
              <button onClick={() => handleToggle(cat)} className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${cat.is_active ? 'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800/40 dark:text-amber-400' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/40 dark:text-emerald-400'}`}>{cat.is_active ? 'Deactivate' : 'Activate'}</button>
            </div>
          </li>
        ))}
      </ul>

      {modalOpen && <CategoryModal editCategory={editCategory} token={token} onSaved={handleSaved} onClose={() => { setModalOpen(false); setEditCategory(null) }} />}
    </div>
  )
}

// ─── Template Management ─────────────────────────────────────────────────────

function TemplateManagement({ token, categories, departments }: { token: string; categories: Category[]; departments: Department[] }) {
  const { data: templates = [], refetch } = useApiQuery<Template[]>('/api/templates', { retry: false })
  const [modalOpen, setModalOpen] = useState(false)
  const [editTemplate, setEditTemplate] = useState<Template | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Template | null>(null)
  const [search, setSearch] = useState('')

  const catMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories])
  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    return templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  }, [templates, search])

  const handleSaved = () => { refetch(); setModalOpen(false); setEditTemplate(null) }
  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    try { await fetch(`/api/templates/${deactivateTarget.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ is_active: false }) }); refetch() } catch {} finally { setDeactivateTarget(null) }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>
        <button onClick={() => { setEditTemplate(null); setModalOpen(true) }} className="px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 shadow-sm shrink-0">+ Create Template</button>
      </div>

      {/* Mobile */}
      <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-700/60 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
        {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-stone-400">{search ? 'No templates match.' : 'No templates.'}</li>}
        {filtered.map(t => (
          <li key={t.id} className="px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{t.name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                  <StatusDot active={t.is_active} />
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400">{catMap[t.category_id] ?? '—'}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => { setEditTemplate(t); setModalOpen(true) }} className="px-2.5 py-1 rounded-lg border border-stone-200 text-[11px] font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300">Edit</button>
                <button disabled={!t.is_active} onClick={() => setDeactivateTarget(t)} className="px-2.5 py-1 rounded-lg border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800/40 dark:text-red-400">Deactivate</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        <table className="min-w-full divide-y divide-stone-100 dark:divide-stone-700 text-sm">
          <thead className="bg-stone-50 dark:bg-stone-800">
            <tr>{['Name', 'Category', 'Priority', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider dark:text-stone-400">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-stone-400">{search ? 'No templates match.' : 'No templates.'}</td></tr>}
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
                <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 whitespace-nowrap">{t.name}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{catMap[t.category_id] ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap"><span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded capitalize ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span></td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusDot active={t.is_active} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex gap-2">
                    <button onClick={() => { setEditTemplate(t); setModalOpen(true) }} className="px-2.5 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-300">Edit</button>
                    <button disabled={!t.is_active} onClick={() => setDeactivateTarget(t)} className="px-2.5 py-1 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800/40 dark:text-red-400">Deactivate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && <TemplateModal editTemplate={editTemplate} categories={categories} departments={departments} token={token} onSaved={handleSaved} onClose={() => { setModalOpen(false); setEditTemplate(null) }} />}
      {deactivateTarget && <ConfirmDialog title="Deactivate Template" message={`Deactivate "${deactivateTarget.name}"? It won't appear on Document Create.`} confirmLabel="Deactivate" onConfirm={handleDeactivate} onCancel={() => setDeactivateTarget(null)} danger />}
    </div>
  )
}

// ─── AdminPage ───────────────────────────────────────────────────────────────

type Tab = 'users' | 'categories' | 'templates'

export default function AdminPage() {
  useDocumentTitle('Admin')
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('users')

  const { data: users = [] } = useApiQuery<User[]>('/api/users', { retry: false, enabled: !!token && user?.role === 'admin' })
  const { data: categories = [] } = useApiQuery<Category[]>('/api/categories', { retry: false, enabled: !!token && user?.role === 'admin' })
  const { data: templates = [] } = useApiQuery<Template[]>('/api/templates', { retry: false, enabled: !!token && user?.role === 'admin' })
  const { data: departments = [] } = useApiQuery<Department[]>('/api/departments', { retry: false, enabled: !!token && user?.role === 'admin' })

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center dark:bg-stone-800 dark:border-stone-700">
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">Access Denied</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">You do not have permission to view this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">Admin</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">Manage users, categories, and templates</p>
          </div>
          <button onClick={() => navigate('/admin/audit-log')} className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors">Audit Log →</button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Users', value: users.length, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Categories', value: categories.length, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Templates', value: templates.length, color: 'text-sky-600 dark:text-sky-400' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 px-4 py-3">
              <p className="text-xs text-stone-500 dark:text-stone-400">{s.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Segmented tabs */}
        <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
          {([['users', 'Users'], ['categories', 'Categories'], ['templates', 'Templates']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === t ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}>{label}</button>
          ))}
        </div>

        {/* Tab panels */}
        {tab === 'users' && <UserManagement token={token!} departments={departments} />}
        {tab === 'categories' && <CategoryManagement token={token!} />}
        {tab === 'templates' && <TemplateManagement token={token!} categories={categories} departments={departments} />}
      </div>
    </div>
  )
}
