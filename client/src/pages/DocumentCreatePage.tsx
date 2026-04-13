import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const DRAFT_KEY = 'noneco_doc_draft'
const AUTOSAVE_INTERVAL = 30000

interface Category { id: number; name: string }
interface Department { id: number; code: string; name: string }
interface Template {
  id: number; name: string; title_prefix: string | null
  category_id: number | null; originating_department_id: number | null
  description: string | null; priority: string | null; is_active: boolean
}
interface FormData {
  title: string; category_id: string; originating_department_id: string
  description: string; deadline: string; priority: string
}

const INITIAL_FORM: FormData = {
  title: '', category_id: '', originating_department_id: '',
  description: '', deadline: '', priority: 'normal',
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', bg: 'bg-gray-100', text: 'text-gray-700', ring: 'ring-gray-300', active: 'bg-gray-200 ring-gray-500' },
  { value: 'normal', label: 'Normal', bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200', active: 'bg-blue-100 ring-blue-500' },
  { value: 'high', label: 'High', bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', active: 'bg-amber-100 ring-amber-500' },
  { value: 'urgent', label: 'Urgent', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200', active: 'bg-red-100 ring-red-500' },
]

function Field({ id, label, required, error, children }: {
  id: string; label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-stone-700 dark:text-stone-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-1" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  )
}

const inputCls = (hasError: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-base text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 ${
    hasError ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600' : 'border-amber-200 hover:border-amber-300 dark:border-stone-600'
  }`

export default function DocumentCreatePage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<FormData>>({})
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/categories?active_only=true', { headers }).then(r => r.json()),
      fetch('/api/departments', { headers }).then(r => r.json()),
      fetch('/api/templates', { headers }).then(r => r.json()),
    ]).then(([cats, depts, tmpls]) => {
      setCategories(Array.isArray(cats) ? cats : [])
      setDepartments(Array.isArray(depts) ? depts : [])
      setTemplates(Array.isArray(tmpls) ? tmpls : [])
    }).catch(() => {}).finally(() => setLoadingData(false)) 
  }, [token])

  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved) {
      try { setForm(JSON.parse(saved) as FormData); setDraftRestored(true) } catch {}
    }
  }, [])

  const saveDraft = useCallback((data: FormData) => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  }, [])

  useEffect(() => {
    autosaveRef.current = setInterval(() => saveDraft(form), AUTOSAVE_INTERVAL)
    return () => { if (autosaveRef.current) clearInterval(autosaveRef.current) }
  }, [form, saveDraft])

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? Number(e.target.value) : null
    setSelectedTemplateId(id)
    if (!id) return
    const tpl = templates.find(t => t.id === id)
    if (!tpl) return
    setForm(prev => ({
      ...prev,
      ...(tpl.title_prefix ? { title: tpl.title_prefix } : {}),
      ...(tpl.category_id != null ? { category_id: String(tpl.category_id) } : {}),
      ...(tpl.originating_department_id != null ? { originating_department_id: String(tpl.originating_department_id) } : {}),
      ...(tpl.description ? { description: tpl.description } : {}),
      ...(tpl.priority ? { priority: tpl.priority } : {}),
    }))
  }

  const validateField = (name: keyof FormData, value: string): string => {
    if (name === 'title' && !value.trim()) return 'Title is required'
    if (name === 'category_id' && !value) return 'Category is required'
    if (name === 'originating_department_id' && !value) return 'Originating department is required'
    return ''
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setErrors(prev => ({ ...prev, [name]: validateField(name as keyof FormData, value) }))
  }

  const validateAll = (): boolean => {
    const newErrors: Partial<FormData> = {
      title: validateField('title', form.title),
      category_id: validateField('category_id', form.category_id),
      originating_department_id: validateField('originating_department_id', form.originating_department_id),
    }
    setErrors(newErrors)
    return !Object.values(newErrors).some(Boolean)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateAll()) return
    setSubmitError(''); setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        category_id: form.category_id,
        originating_department_id: form.originating_department_id,
        priority: form.priority,
      }
      if (form.description.trim()) body.description = form.description.trim()
      if (form.deadline) body.deadline = form.deadline
      if (selectedTemplateId != null) body.template_id = selectedTemplateId
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        localStorage.removeItem(DRAFT_KEY)
        navigate(`/documents/${data.id}`)
        return
      }
      const err = await res.json().catch(() => ({}))
      setSubmitError(err?.error?.message || 'Failed to create document. Please try again.')
    } catch { setSubmitError('Unable to connect. Please try again.') }
    finally { setSubmitting(false) }
  }

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

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="min-h-[36px] px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50 transition-all">
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Create Document</h1>
            <p className="text-stone-400 text-sm mt-0.5">Fill in the details to start tracking</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {draftRestored && (
          <div role="status" className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-sm text-amber-800 flex items-center gap-2 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-300">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Draft restored from your last session.
          </div>
        )}

        {submitError && (
          <div role="alert" className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400">{submitError}</div>
        )}

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-card border border-stone-200 overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
            {/* Card section header */}
            <div className="pb-4 border-b border-stone-100 dark:border-stone-700">
              <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Document Information</h2>
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">Fields marked with * are required</p>
            </div>
            {/* Template selector */}
            {templates.length > 0 && (
              <Field id="template_id" label="Use Template">
                <select id="template_id" name="template_id"
                  value={selectedTemplateId ?? ''}
                  onChange={handleTemplateChange}
                  className={inputCls(false)}>
                  <option value="">None</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}

            {/* Title */}
            <Field id="title" label="Document Title" required error={errors.title}>
              <input id="title" name="title" type="text" value={form.title}
                onChange={handleChange} onBlur={handleBlur}
                aria-required="true" aria-invalid={!!errors.title}
                placeholder="Enter document title…"
                className={inputCls(!!errors.title)} />
            </Field>

            {/* Category + Department side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="category_id" label="Category" required error={errors.category_id}>
                <select id="category_id" name="category_id" value={form.category_id}
                  onChange={handleChange} onBlur={handleBlur}
                  aria-required="true" aria-invalid={!!errors.category_id}
                  className={inputCls(!!errors.category_id)}>
                  <option value="">Select category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              <Field id="originating_department_id" label="Originating Department" required error={errors.originating_department_id}>
                <select id="originating_department_id" name="originating_department_id"
                  value={form.originating_department_id}
                  onChange={handleChange} onBlur={handleBlur}
                  aria-required="true" aria-invalid={!!errors.originating_department_id}
                  className={inputCls(!!errors.originating_department_id)}>
                  <option value="">Select department…</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                </select>
              </Field>
            </div>

            {/* Description */}
            <Field id="description" label="Description">
              <textarea id="description" name="description" rows={3} value={form.description}
                onChange={handleChange} placeholder="Optional description or notes…"
                className="w-full rounded-lg border border-amber-200 px-3 py-2.5 text-base text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 hover:border-amber-300 transition-colors resize-none dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 dark:placeholder-stone-500" />
            </Field>

            {/* Deadline */}
            <Field id="deadline" label="Deadline">
              <input id="deadline" name="deadline" type="date" value={form.deadline}
                onChange={handleChange}
                className="w-full rounded-lg border border-amber-200 px-3 py-2.5 text-base text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 hover:border-amber-300 transition-colors dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100" />
            </Field>

            {/* Priority — button group */}
            <div>
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-2">Priority</p>
              <div className="grid grid-cols-4 gap-2">
                {PRIORITY_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setForm(prev => ({ ...prev, priority: opt.value }))}
                    className={`min-h-[44px] rounded-lg border text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 ring-1 ${
                      form.priority === opt.value
                        ? `${opt.active} ${opt.text} ring-2`
                        : `${opt.bg} ${opt.text} ${opt.ring} hover:opacity-80`
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-stone-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Attachments can be added after creation on the document detail page.
            </p>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-stone-100 dark:border-stone-700">
              <button type="submit" disabled={submitting}
                className="flex-1 min-h-[44px] rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating…
                  </span>
                ) : 'Create Document'}
              </button>
              <button type="button" onClick={() => navigate(-1)} disabled={submitting}
                className="min-h-[44px] px-5 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 disabled:opacity-60 transition-all dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
