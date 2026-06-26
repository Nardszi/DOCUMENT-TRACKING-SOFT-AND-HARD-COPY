import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Category { id: string; name: string }
interface Department { id: string; code: string; name: string }

export default function QuickCreate() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [deptId, setDeptId] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState('normal')
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !token) return
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/categories?active_only=true', { headers }).then(r => r.ok ? r.json() : []),
      fetch('/api/departments', { headers }).then(r => r.ok ? r.json() : []),
    ]).then(([cats, depts]) => {
      setCategories(Array.isArray(cats) ? cats : [])
      setDepartments(Array.isArray(depts) ? depts : [])
      if (user?.departmentId && !deptId) setDeptId(String(user.departmentId))
    }).catch(() => {})
  }, [open, token, user?.departmentId])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !categoryId || !deptId) { setError('Fill all required fields.'); return }
    setError(''); setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        category_id: categoryId,
        originating_department_id: deptId,
        priority,
      }
      if (description.trim()) body.description = description.trim()
      if (deadline) body.deadline = deadline
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        setTitle(''); setCategoryId(''); setDescription(''); setDeadline(''); setPriority('normal')
        navigate(`/documents/${data.id}`)
        return
      }
      const err = await res.json().catch(() => ({}))
      setError(err?.error?.message || 'Failed.')
    } catch { setError('Connection failed.') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 transition-colors shadow-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        New Document
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xl z-50 overflow-hidden animate-slide-up">
          <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-700 flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Quick Create</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
            <input ref={inputRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Document title *" className="w-full rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">Category *</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">Department *</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Description (optional)…" className="w-full rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <div className="flex gap-1.5">
              {['low', 'normal', 'high', 'urgent'].map(p => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                    priority === p ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700' : 'bg-stone-50 dark:bg-stone-700 text-stone-500 border-stone-200 dark:border-stone-600 hover:bg-stone-100'
                  }`}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={submitting || !title.trim()}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                {submitting ? 'Creating…' : 'Create'}
              </button>
              <button type="button" onClick={() => navigate('/documents/new')}
                className="px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                Full Form
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
