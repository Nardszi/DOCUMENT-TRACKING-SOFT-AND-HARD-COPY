import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'staff' | 'department_head' | 'admin'

interface Department {
  id: string
  code: string
  name: string
}

interface User {
  id: string
  username: string
  email: string
  full_name: string
  role: Role
  department_id: string
  is_active: boolean
}

interface Category {
  id: string
  name: string
  is_active: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<Role, string> = {
  staff: 'Staff',
  department_head: 'Department Head',
  admin: 'Admin',
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${
        active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`}
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ─── User Form Modal ──────────────────────────────────────────────────────────

interface UserFormData {
  username: string
  password: string
  email: string
  full_name: string
  role: Role
  department_id: string
}

const EMPTY_USER_FORM: UserFormData = {
  username: '',
  password: '',
  email: '',
  full_name: '',
  role: 'staff',
  department_id: '',
}

interface UserModalProps {
  editUser: User | null
  departments: Department[]
  token: string
  onSaved: (user: User) => void
  onClose: () => void
}

function UserModal({ editUser, departments, token, onSaved, onClose }: UserModalProps) {
  const isEdit = !!editUser
  const [form, setForm] = useState<UserFormData>(() =>
    isEdit
      ? {
          username: editUser.username,
          password: '',
          email: editUser.email,
          full_name: editUser.full_name,
          role: editUser.role,
          department_id: editUser.department_id,
        }
      : EMPTY_USER_FORM
  )
  const [errors, setErrors] = useState<Partial<UserFormData>>({})
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  const validate = (): boolean => {
    const e: Partial<UserFormData> = {}
    if (!isEdit && !form.username.trim()) e.username = 'Username is required'
    if (!isEdit && form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Valid email is required'
    if (!form.full_name.trim()) e.full_name = 'Full name is required'
    if (!form.department_id) e.department_id = 'Department is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleBlur = (field: keyof UserFormData) => {
    const e = { ...errors }
    if (field === 'username' && !isEdit && !form.username.trim()) e.username = 'Username is required'
    else if (field === 'username') delete e.username
    if (field === 'password' && !isEdit && form.password.length < 8)
      e.password = 'Password must be at least 8 characters'
    else if (field === 'password') delete e.password
    if (field === 'email' && (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)))
      e.email = 'Valid email is required'
    else if (field === 'email') delete e.email
    if (field === 'full_name' && !form.full_name.trim()) e.full_name = 'Full name is required'
    else if (field === 'full_name') delete e.full_name
    if (field === 'department_id' && !form.department_id) e.department_id = 'Department is required'
    else if (field === 'department_id') delete e.department_id
    setErrors(e)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setApiError('')
    try {
      const url = isEdit ? `/api/users/${editUser!.id}` : '/api/users'
      const method = isEdit ? 'PATCH' : 'POST'
      const body: Record<string, string> = {
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        role: form.role,
        department_id: form.department_id,
      }
      if (!isEdit) {
        body.username = form.username.trim()
        body.password = form.password
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const saved: User = await res.json()
        onSaved(saved)
        return
      }
      const data = await res.json().catch(() => ({}))
      setApiError(data?.error?.message || 'Failed to save user. Please try again.')
    } catch {
      setApiError('Unable to connect. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-card-lg border border-stone-100 p-6 max-h-[90vh] overflow-y-auto dark:bg-stone-800 dark:border-stone-700">
        <h2 id="user-modal-title" className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-5">
          {isEdit ? 'Edit User' : 'Add User'}
        </h2>

        {apiError && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {!isEdit && (
            <Field label="Username" id="um-username" error={errors.username}>
              <input
                id="um-username"
                type="text"
                autoComplete="off"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                onBlur={() => handleBlur('username')}
                aria-invalid={!!errors.username}
                className={inputCls(!!errors.username)}
              />
            </Field>
          )}
          {!isEdit && (
            <Field label="Password" id="um-password" error={errors.password}>
              <input
                id="um-password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                onBlur={() => handleBlur('password')}
                aria-invalid={!!errors.password}
                className={inputCls(!!errors.password)}
              />
            </Field>
          )}
          <Field label="Full Name" id="um-fullname" error={errors.full_name}>
            <input
              id="um-fullname"
              type="text"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              onBlur={() => handleBlur('full_name')}
              aria-invalid={!!errors.full_name}
              className={inputCls(!!errors.full_name)}
            />
          </Field>
          <Field label="Email" id="um-email" error={errors.email}>
            <input
              id="um-email"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              onBlur={() => handleBlur('email')}
              aria-invalid={!!errors.email}
              className={inputCls(!!errors.email)}
            />
          </Field>
          <Field label="Role" id="um-role" error={undefined}>
            <select
              id="um-role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              className={inputCls(false)}
            >
              <option value="staff">Staff</option>
              <option value="department_head">Department Head</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Department" id="um-dept" error={errors.department_id}>
            <select
              id="um-dept"
              value={form.department_id}
              onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
              onBlur={() => handleBlur('department_id')}
              aria-invalid={!!errors.department_id}
              className={inputCls(!!errors.department_id)}
            >
              <option value="">Select department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Category Modal ───────────────────────────────────────────────────────────

interface CategoryModalProps {
  editCategory: Category | null
  token: string
  onSaved: (cat: Category) => void
  onClose: () => void
}

function CategoryModal({ editCategory, token, onSaved, onClose }: CategoryModalProps) {
  const isEdit = !!editCategory
  const [name, setName] = useState(editCategory?.name ?? '')
  const [nameError, setNameError] = useState('')
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  const validateName = () => {
    if (!name.trim()) { setNameError('Category name is required'); return false }
    setNameError('')
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateName()) return
    setSaving(true)
    setApiError('')
    try {
      const url = isEdit ? `/api/categories/${editCategory!.id}` : '/api/categories'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (res.ok) {
        const saved: Category = await res.json()
        onSaved(saved)
        return
      }
      const data = await res.json().catch(() => ({}))
      setApiError(data?.error?.message || 'Failed to save category. Please try again.')
    } catch {
      setApiError('Unable to connect. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cat-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-card-lg border border-stone-100 p-6 dark:bg-stone-800 dark:border-stone-700">
        <h2 id="cat-modal-title" className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-5">
          {isEdit ? 'Rename Category' : 'Add Category'}
        </h2>

        {apiError && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Field label="Category Name" id="cat-name" error={nameError}>
            <input
              id="cat-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={validateName}
              aria-invalid={!!nameError}
              className={inputCls(!!nameError)}
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2.5 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Rename' : 'Add Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function inputCls(hasError: boolean) {
  return `w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 ${
    hasError ? 'border-red-400 dark:border-red-600' : 'border-stone-200 dark:border-stone-600'
  }`
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string
  id: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

// ─── User Management Tab ──────────────────────────────────────────────────────

interface UserManagementProps {
  token: string
}

function UserManagement({ token }: UserManagementProps) {
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)

  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.code]))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [usersRes, deptsRes] = await Promise.all([
        fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (!usersRes.ok || !deptsRes.ok) throw new Error('Failed to load data')
      const [usersData, deptsData] = await Promise.all([usersRes.json(), deptsRes.json()])
      setUsers(usersData)
      setDepartments(deptsData)
    } catch {
      setError('Failed to load users. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaved = (saved: User) => {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    setModalOpen(false)
    setEditUser(null)
  }

  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    try {
      const res = await fetch(`/api/users/${deactivateTarget.id}/deactivate`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const updated: User = await res.json()
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setDeactivateTarget(null)
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-8 text-stone-500 dark:text-stone-400"><div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /><span className="text-sm">Loading users…</span></div>
  if (error) return <p role="alert" className="text-sm text-red-600 py-4">{error}</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Users</h2>
        <button
          type="button"
          onClick={() => { setEditUser(null); setModalOpen(true) }}
          className="min-h-[36px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 shadow-sm"
        >
          Add User
        </button>
      </div>

      {/* Mobile cards (hidden on md+) */}
      <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-700/60 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden mb-0">
        {users.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">No users found.</li>
        )}
        {users.map((u) => (
          <li key={u.id} className="px-4 py-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{u.full_name}</span>
                  <StatusBadge active={u.is_active} />
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 truncate">@{u.username} · {u.email}</p>
                <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{ROLE_LABELS[u.role]} · {deptMap[u.department_id] ?? '—'}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setEditUser(u); setModalOpen(true) }}
                  className="min-h-[32px] px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={!u.is_active}
                  onClick={() => setDeactivateTarget(u)}
                  className="min-h-[32px] px-3 py-1 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Deactivate
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop table (hidden on mobile) */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-700">
        <table className="min-w-full divide-y divide-stone-100 dark:divide-stone-700 text-sm">
          <thead className="bg-stone-50 dark:bg-stone-800">
            <tr>
              {['Full Name', 'Username', 'Email', 'Role', 'Department', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60 bg-white dark:bg-stone-900">
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
                <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 whitespace-nowrap">{u.full_name}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{u.username}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{u.email}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{deptMap[u.department_id] ?? u.department_id}</td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusBadge active={u.is_active} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setEditUser(u); setModalOpen(true) }}
                      className="min-h-[32px] px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={!u.is_active}
                      onClick={() => setDeactivateTarget(u)}
                      className="min-h-[32px] px-3 py-1 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <UserModal
          editUser={editUser}
          departments={departments}
          token={token}
          onSaved={handleSaved}
          onClose={() => { setModalOpen(false); setEditUser(null) }}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate User"
          message={`Are you sure you want to deactivate "${deactivateTarget.full_name}"? They will no longer be able to log in.`}
          confirmLabel="Deactivate"
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
          danger
        />
      )}
    </div>
  )
}

// ─── Category Management Tab ──────────────────────────────────────────────────

interface CategoryManagementProps {
  token: string
}

function CategoryManagement({ token }: CategoryManagementProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editCategory, setEditCategory] = useState<Category | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/categories', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      setCategories(await res.json())
    } catch {
      setError('Failed to load categories. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const handleSaved = (saved: Category) => {
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
    setModalOpen(false)
    setEditCategory(null)
  }

  const handleToggleActive = async (cat: Category) => {
    setTogglingId(cat.id)
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !cat.is_active }),
      })
      if (res.ok) {
        const updated: Category = await res.json()
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      }
    } catch {
      // silently fail
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-8 text-stone-500 dark:text-stone-400"><div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /><span className="text-sm">Loading categories…</span></div>
  if (error) return <p role="alert" className="text-sm text-red-600 py-4">{error}</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Document Categories</h2>
        <button
          type="button"
          onClick={() => { setEditCategory(null); setModalOpen(true) }}
          className="min-h-[36px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 shadow-sm"
        >
          Add Category
        </button>
      </div>

      <ul className="divide-y divide-stone-100 dark:divide-stone-700/60 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
        {categories.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">No categories found.</li>
        )}
        {categories.map((cat) => (
          <li key={cat.id} className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{cat.name}</span>
              <StatusBadge active={cat.is_active} />
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setEditCategory(cat); setModalOpen(true) }}
                className="min-h-[32px] px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                Rename
              </button>
              <button
                type="button"
                disabled={togglingId === cat.id}
                onClick={() => handleToggleActive(cat)}
                className={`min-h-[32px] px-3 py-1 rounded-lg border text-xs font-medium focus:outline-none focus:ring-2 disabled:opacity-60 transition-colors ${
                  cat.is_active
                    ? 'border-amber-200 text-amber-700 hover:bg-amber-50 focus:ring-amber-400 dark:border-amber-800/40 dark:text-amber-400 dark:hover:bg-amber-900/20'
                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-400 dark:border-emerald-800/40 dark:text-emerald-400 dark:hover:bg-emerald-900/20'
                }`}
              >
                {togglingId === cat.id ? '…' : cat.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {modalOpen && (
        <CategoryModal
          editCategory={editCategory}
          token={token}
          onSaved={handleSaved}
          onClose={() => { setModalOpen(false); setEditCategory(null) }}
        />
      )}
    </div>
  )
}

// ─── Template Management Tab ──────────────────────────────────────────────────

interface Template {
  id: string
  name: string
  title_prefix: string
  category_id: string
  originating_department_id: string
  description: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

interface TemplateFormData {
  name: string
  title_prefix: string
  category_id: string
  originating_department_id: string
  description: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
}

const EMPTY_TEMPLATE_FORM: TemplateFormData = {
  name: '',
  title_prefix: '',
  category_id: '',
  originating_department_id: '',
  description: '',
  priority: 'normal',
}

interface TemplateModalProps {
  editTemplate: Template | null
  categories: Category[]
  departments: Department[]
  token: string
  onSaved: (t: Template) => void
  onClose: () => void
}

function TemplateModal({ editTemplate, categories, departments, token, onSaved, onClose }: TemplateModalProps) {
  const isEdit = !!editTemplate
  const [form, setForm] = useState<TemplateFormData>(() =>
    isEdit
      ? {
          name: editTemplate.name,
          title_prefix: editTemplate.title_prefix,
          category_id: editTemplate.category_id ?? '',
          originating_department_id: editTemplate.originating_department_id ?? '',
          description: editTemplate.description ?? '',
          priority: editTemplate.priority,
        }
      : EMPTY_TEMPLATE_FORM
  )
  const [nameError, setNameError] = useState('')
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  const validateName = () => {
    if (!form.name.trim()) { setNameError('Template name is required'); return false }
    setNameError('')
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateName()) return
    setSaving(true)
    setApiError('')
    try {
      const url = isEdit ? `/api/templates/${editTemplate!.id}` : '/api/templates'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name.trim(),
          title_prefix: form.title_prefix.trim(),
          category_id: form.category_id || null,
          originating_department_id: form.originating_department_id || null,
          description: form.description.trim(),
          priority: form.priority,
        }),
      })
      if (res.ok) {
        const saved: Template = await res.json()
        onSaved(saved)
        return
      }
      const data = await res.json().catch(() => ({}))
      setApiError(data?.error?.message || 'Failed to save template. Please try again.')
    } catch {
      setApiError('Unable to connect. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tmpl-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-card-lg border border-stone-100 p-6 max-h-[90vh] overflow-y-auto dark:bg-stone-800 dark:border-stone-700">
        <h2 id="tmpl-modal-title" className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-5">
          {isEdit ? 'Edit Template' : 'Create Template'}
        </h2>

        {apiError && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field label="Template Name *" id="tmpl-name" error={nameError}>
            <input
              id="tmpl-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onBlur={validateName}
              aria-invalid={!!nameError}
              className={inputCls(!!nameError)}
              autoFocus
            />
          </Field>
          <Field label="Title Prefix" id="tmpl-title-prefix" error={undefined}>
            <input
              id="tmpl-title-prefix"
              type="text"
              value={form.title_prefix}
              onChange={(e) => setForm((f) => ({ ...f, title_prefix: e.target.value }))}
              className={inputCls(false)}
            />
          </Field>
          <Field label="Category" id="tmpl-category" error={undefined}>
            <select
              id="tmpl-category"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className={inputCls(false)}
            >
              <option value="">— None —</option>
              {categories.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Originating Department" id="tmpl-dept" error={undefined}>
            <select
              id="tmpl-dept"
              value={form.originating_department_id}
              onChange={(e) => setForm((f) => ({ ...f, originating_department_id: e.target.value }))}
              className={inputCls(false)}
            >
              <option value="">— None —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" id="tmpl-desc" error={undefined}>
            <textarea
              id="tmpl-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputCls(false)}
            />
          </Field>
          <Field label="Priority" id="tmpl-priority" error={undefined}>
            <select
              id="tmpl-priority"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TemplateFormData['priority'] }))}
              className={inputCls(false)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface TemplateManagementProps {
  token: string
}

function TemplateManagement({ token }: TemplateManagementProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTemplate, setEditTemplate] = useState<Template | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Template | null>(null)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]))
  const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.code]))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [tmplRes, catRes, deptRes] = await Promise.all([
        fetch('/api/templates', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/categories', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (!tmplRes.ok || !catRes.ok || !deptRes.ok) throw new Error()
      const [tmplData, catData, deptData] = await Promise.all([tmplRes.json(), catRes.json(), deptRes.json()])
      setTemplates(tmplData)
      setCategories(catData)
      setDepartments(deptData)
    } catch {
      setError('Failed to load templates. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaved = (saved: Template) => {
    setTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === saved.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
      return [saved, ...prev]
    })
    setModalOpen(false)
    setEditTemplate(null)
  }

  const handleDeactivate = async () => {
    if (!deactivateTarget) return
    try {
      const res = await fetch(`/api/templates/${deactivateTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: false }),
      })
      if (res.ok) {
        const updated: Template = await res.json()
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      }
    } catch {
      // silently fail
    } finally {
      setDeactivateTarget(null)
    }
  }

  if (loading) return <div className="flex items-center gap-2 py-8 text-stone-500 dark:text-stone-400"><div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /><span className="text-sm">Loading templates…</span></div>
  if (error) return <p role="alert" className="text-sm text-red-600 py-4">{error}</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Document Templates</h2>
        <button
          type="button"
          onClick={() => { setEditTemplate(null); setModalOpen(true) }}
          className="min-h-[36px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 shadow-sm"
        >
          Create Template
        </button>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-700/60 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
        {templates.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">No templates found.</li>
        )}
        {templates.map((t) => (
          <li key={t.id} className="px-4 py-3.5 hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{t.name}</span>
                  <StatusBadge active={t.is_active} />
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400">{catMap[t.category_id] ?? '—'} · <span className="capitalize">{t.priority}</span></p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button type="button" onClick={() => { setEditTemplate(t); setModalOpen(true) }}
                  className="min-h-[32px] px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700">
                  Edit
                </button>
                <button type="button" disabled={!t.is_active} onClick={() => setDeactivateTarget(t)}
                  className="min-h-[32px] px-3 py-1 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20">
                  Deactivate
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-700">
        <table className="min-w-full divide-y divide-stone-100 dark:divide-stone-700 text-sm">
          <thead className="bg-stone-50 dark:bg-stone-800">
            <tr>
              {['Name', 'Category', 'Priority', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap dark:text-stone-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60 bg-white dark:bg-stone-900">
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">
                  No templates found.
                </td>
              </tr>
            )}
            {templates.map((t) => (
              <tr key={t.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors">
                <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100 whitespace-nowrap">{t.name}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{catMap[t.category_id] ?? '—'}</td>
                <td className="px-4 py-3 text-stone-600 dark:text-stone-300 capitalize whitespace-nowrap">{t.priority}</td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusBadge active={t.is_active} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditTemplate(t); setModalOpen(true) }}
                      className="min-h-[32px] px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700">
                      Edit
                    </button>
                    <button type="button" disabled={!t.is_active} onClick={() => setDeactivateTarget(t)}
                      className="min-h-[32px] px-3 py-1 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-900/20">
                      Deactivate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <TemplateModal
          editTemplate={editTemplate}
          categories={categories}
          departments={departments}
          token={token}
          onSaved={handleSaved}
          onClose={() => { setModalOpen(false); setEditTemplate(null) }}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title="Deactivate Template"
          message={`Are you sure you want to deactivate "${deactivateTarget.name}"? It will no longer appear on the Document Create page.`}
          confirmLabel="Deactivate"
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
          danger
        />
      )}
    </div>
  )
}

// ─── AdminPage ────────────────────────────────────────────────────────────────

type Tab = 'users' | 'categories' | 'templates' | 'audit-log'

export default function AdminPage() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('users')

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center shadow-card dark:bg-stone-800 dark:border-stone-700">
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-2">Access Denied</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">You do not have permission to view this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-bold text-white tracking-tight">Admin Panel</h1>
          <p className="text-stone-400 text-sm mt-0.5">Manage users, categories, and templates</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs — scrollable on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 mb-6">
          <div className="flex border-b border-stone-200 dark:border-stone-700 min-w-max" role="tablist">
            {([
              ['users',      'Users'],
              ['categories', 'Categories'],
              ['templates',  'Templates'],
              ['audit-log',  'Audit Log'],
            ] as [Tab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                type="button"
                onClick={() => {
                  if (tab === 'audit-log') {
                    navigate('/admin/audit-log')
                  } else {
                    setActiveTab(tab)
                  }
                }}
                className={`min-h-[40px] px-4 sm:px-6 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors ${
                  activeTab === tab
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                    : 'border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300 dark:text-stone-400 dark:hover:text-stone-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab panels */}
        <div role="tabpanel">
          {activeTab === 'users' && <UserManagement token={token!} />}
          {activeTab === 'categories' && <CategoryManagement token={token!} />}
          {activeTab === 'templates' && <TemplateManagement token={token!} />}
        </div>
      </div>
    </div>
  )
}
