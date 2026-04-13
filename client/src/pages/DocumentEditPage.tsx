import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Category {
  id: number
  name: string
}

interface Department {
  id: number
  code: string
  name: string
}

interface FormData {
  title: string
  category_id: string
  originating_department_id: string
  description: string
  deadline: string
  priority: string
}

interface DocumentDetail {
  id: number
  tracking_number: string
  title: string
  category: { id: number; name: string }
  originating_department: { id: number; code: string; name: string }
  description: string | null
  status: string
  priority: string
  deadline: string | null
}

export default function DocumentEditPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormData>({
    title: '',
    category_id: '',
    originating_department_id: '',
    description: '',
    deadline: '',
    priority: 'normal',
  })
  const [errors, setErrors] = useState<Partial<FormData>>({})
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch(`/api/documents/${id}`, { headers }).then((r) => {
        if (!r.ok) throw new Error('Document not found')
        return r.json()
      }),
      fetch('/api/categories?active_only=true', { headers }).then((r) => r.json()),
      fetch('/api/departments', { headers }).then((r) => r.json()),
    ])
      .then(([doc, cats, depts]) => {
        setDocument(doc)
        setCategories(Array.isArray(cats) ? cats : cats.categories ?? [])
        setDepartments(Array.isArray(depts) ? depts : [])
        setForm({
          title: doc.title ?? '',
          category_id: doc.category?.id ? String(doc.category.id) : '',
          originating_department_id: doc.originating_department?.id ? String(doc.originating_department.id) : '',
          description: doc.description ?? '',
          deadline: doc.deadline ? doc.deadline.split('T')[0] : '',
          priority: doc.priority ? doc.priority.toLowerCase() : 'normal',
        })
      })
      .catch((err) => setLoadError(err.message || 'Failed to load document.'))
      .finally(() => setLoadingData(false))
  }, [id, token])

  const validateField = (name: keyof FormData, value: string): string => {
    if (name === 'title' && !value.trim()) return 'Title is required'
    if (name === 'category_id' && !value) return 'Category is required'
    return ''
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    const error = validateField(name as keyof FormData, value)
    setErrors((prev) => ({ ...prev, [name]: error }))
  }

  const validateAll = (): boolean => {
    const newErrors: Partial<FormData> = {
      title: validateField('title', form.title),
      category_id: validateField('category_id', form.category_id),
    }
    setErrors(newErrors)
    return !Object.values(newErrors).some(Boolean)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateAll()) return

    setSubmitError('')
    setSubmitting(true)

    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        category_id: form.category_id || undefined,
        originating_department_id: form.originating_department_id || undefined,
        priority: form.priority,
        description: form.description.trim() || null,
        deadline: form.deadline || null,
      }

      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        navigate(`/documents/${id}`)
        return
      }

      const err = await res.json().catch(() => ({}))
      setSubmitError(err?.error?.message || err?.message || 'Failed to update document. Please try again.')
    } catch {
      setSubmitError('Unable to connect. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = (field: keyof FormData) =>
    `w-full rounded-xl border px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 transition-colors ${
      errors[field]
        ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600'
        : 'border-stone-200 dark:border-stone-600'
    }`

  if (loadingData) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-500 dark:text-stone-400">
          <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">
          {loadError}
        </div>
      </div>
    )
  }

  // Read-only view for completed documents
  if (document?.status === 'completed') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
        {/* Top banner */}
        <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/documents/${id}`)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Edit Document</h1>
              <p className="text-stone-400 text-sm mt-0.5">Read-only — document is completed</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">
          <div
            role="alert"
            className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800"
          >
            This document is completed and cannot be edited.
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-8 space-y-5 dark:bg-stone-800/80 dark:border-stone-700">
            <ReadOnlyField label="Title" value={document.title} />
            <ReadOnlyField label="Category" value={document.category?.name} />
            <ReadOnlyField
              label="Originating Department"
              value={
                document.originating_department
                  ? `${document.originating_department.code} — ${document.originating_department.name}`
                  : ''
              }
            />
            <ReadOnlyField label="Description" value={document.description ?? '—'} />
            <ReadOnlyField
              label="Deadline"
              value={document.deadline ? document.deadline.split('T')[0] : '—'}
            />
            <ReadOnlyField label="Priority" value={document.priority} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/documents/${id}`)}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Edit Document</h1>
            <p className="text-stone-400 text-sm mt-0.5">Update document details</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {submitError && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400"
          >
            {submitError}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
          <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Document Details</h2>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Fields marked with * are required</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Title <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={form.title}
                onChange={handleChange}
                onBlur={handleBlur}
                aria-required="true"
                aria-describedby={errors.title ? 'title-error' : undefined}
                aria-invalid={!!errors.title}
                className={inputClass('title')}
              />
              {errors.title && (
                <p id="title-error" className="mt-1 text-xs text-red-600">{errors.title}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category_id" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Category <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <select
                id="category_id"
                name="category_id"
                value={form.category_id}
                onChange={handleChange}
                onBlur={handleBlur}
                aria-required="true"
                aria-describedby={errors.category_id ? 'category-error' : undefined}
                aria-invalid={!!errors.category_id}
                className={inputClass('category_id')}
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.category_id && (
                <p id="category-error" className="mt-1 text-xs text-red-600">{errors.category_id}</p>
              )}
            </div>

            {/* Originating Department */}
            <div>
              <label htmlFor="originating_department_id" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Originating Department
              </label>
              <select
                id="originating_department_id"
                name="originating_department_id"
                value={form.originating_department_id}
                onChange={handleChange}
                className={inputClass('originating_department_id')}
              >
                <option value="">Select department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                value={form.description}
                onChange={handleChange}
                className="w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-colors"
              />
            </div>

            {/* Deadline */}
            <div>
              <label htmlFor="deadline" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Deadline
              </label>
              <input
                id="deadline"
                name="deadline"
                type="date"
                value={form.deadline}
                onChange={handleChange}
                className="w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-colors"
              />
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className="w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-colors"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2 border-t border-stone-100 dark:border-stone-700">
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[40px] px-6 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/documents/${id}`)}
                disabled={submitting}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">{label}</dt>
      <dd className="text-sm text-stone-900 dark:text-stone-100">{value || '—'}</dd>
    </div>
  )
}
