import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import DeadlineBadge from '../components/DeadlineBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../components/ToastContainer'

interface Category { id: number; name: string }
interface Department { id: number; code: string; name: string }
interface Document {
  id: number; tracking_number: string; title: string
  category: { id: number; name: string }
  current_department: { id: number; code: string; name: string }
  status: string; priority: string; deadline: string | null
  is_overdue: boolean; updated_at: string
}
interface Filters {
  search: string; status: string; department_id: string
  priority: string; category_id: string; deadline_from: string; deadline_to: string
}
const EMPTY_FILTERS: Filters = { search: '', status: '', department_id: '', priority: '', category_id: '', deadline_from: '', deadline_to: '' }
const PAGE_SIZE = 25
const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'] as const
type Priority = typeof PRIORITY_OPTIONS[number]

type BulkConfirmAction = 'complete' | 'priority' | null

function formatUpdated(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const fieldCls = 'rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[40px] w-full dark:bg-stone-800 dark:border-stone-600 dark:text-stone-100 transition-all'

export default function DocumentListPage() {
  const { token, user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS)
  const [categories, setCategories] = useState<Category[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkPriority, setBulkPriority] = useState<Priority>('normal')
  const [confirmAction, setConfirmAction] = useState<BulkConfirmAction>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const canBulkAction = user?.role === 'department_head' || user?.role === 'admin'

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch('/api/categories', { headers }).then(r => r.json()),
      fetch('/api/departments', { headers }).then(r => r.json()),
    ]).then(([cats, depts]) => {
      setCategories(Array.isArray(cats) ? cats : [])
      setDepartments(Array.isArray(depts) ? depts : [])
    }).catch(() => {})
  }, [token])

  const fetchDocuments = useCallback(async (f: Filters, p: number) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
      if (f.search) params.set('search', f.search)
      if (f.status) params.set('status', f.status)
      if (f.department_id) params.set('department_id', f.department_id)
      if (f.priority) params.set('priority', f.priority)
      if (f.category_id) params.set('category_id', f.category_id)
      if (f.deadline_from) params.set('deadline_from', f.deadline_from)
      if (f.deadline_to) params.set('deadline_to', f.deadline_to)
      const res = await fetch(`/api/documents?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDocuments(data.data ?? []); setTotal(data.total ?? 0); setTotalPages(data.totalPages ?? 1)
    } catch { setError('Failed to load documents. Please try again.') }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { fetchDocuments(appliedFilters, page) }, [appliedFilters, page, fetchDocuments])

  // Clear selection when page/filters change
  useEffect(() => { setSelectedIds([]) }, [appliedFilters, page])

  // Update header checkbox indeterminate state
  useEffect(() => {
    if (!headerCheckboxRef.current) return
    const allSelected = documents.length > 0 && selectedIds.length === documents.length
    const someSelected = selectedIds.length > 0 && selectedIds.length < documents.length
    headerCheckboxRef.current.checked = allSelected
    headerCheckboxRef.current.indeterminate = someSelected
  }, [selectedIds, documents])

  function toggleSelectAll() {
    if (selectedIds.length === documents.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(documents.map(d => String(d.id)))
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function executeBulkComplete() {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/documents/bulk-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_ids: selectedIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message ?? 'Bulk action failed')
      const { completed, skipped } = data
      showToast(`${completed} marked complete.${skipped > 0 ? ` ${skipped} skipped.` : ''}`, 'success')
      setSelectedIds([])
      fetchDocuments(appliedFilters, page)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Bulk action failed', 'error')
    } finally {
      setBulkLoading(false)
      setConfirmAction(null)
    }
  }

  async function executeBulkSetPriority() {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/documents/bulk-set-priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_ids: selectedIds, priority: bulkPriority }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message ?? 'Bulk action failed')
      const { updated } = data
      showToast(`${updated} document${updated !== 1 ? 's' : ''} updated.`, 'success')
      setSelectedIds([])
      fetchDocuments(appliedFilters, page)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Bulk action failed', 'error')
    } finally {
      setBulkLoading(false)
      setConfirmAction(null)
    }
  }

  function handleConfirm() {
    if (confirmAction === 'complete') executeBulkComplete()
    else if (confirmAction === 'priority') executeBulkSetPriority()
  }

  const confirmMessage = confirmAction === 'complete'
    ? `Mark ${selectedIds.length} document${selectedIds.length !== 1 ? 's' : ''} as complete?`
    : `Set priority to "${bulkPriority}" for ${selectedIds.length} document${selectedIds.length !== 1 ? 's' : ''}?`

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Documents</h1>
            <p className="text-stone-400 text-sm mt-0.5">Manage and track all documents</p>
          </div>
          <Link
            to="/documents/new"
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-stone-900 shadow-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Document
          </Link>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-5">

        {/* Filter bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); setPage(1); setAppliedFilters(filters) }}
          className="bg-white rounded-2xl shadow-card border border-stone-200 p-4 mb-4 dark:bg-stone-800/80 dark:border-stone-700"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <input type="text" name="search" value={filters.search}
              onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
              placeholder="Search title or tracking #" className={fieldCls} aria-label="Search" />
            <select name="status" value={filters.status}
              onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} className={fieldCls}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="forwarded">Forwarded</option>
              <option value="returned">Returned</option>
              <option value="completed">Completed</option>
            </select>
            <select name="department_id" value={filters.department_id}
              onChange={e => setFilters(p => ({ ...p, department_id: e.target.value }))} className={fieldCls}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
            <select name="priority" value={filters.priority}
              onChange={e => setFilters(p => ({ ...p, priority: e.target.value }))} className={fieldCls}>
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <select name="category_id" value={filters.category_id}
              onChange={e => setFilters(p => ({ ...p, category_id: e.target.value }))} className={fieldCls}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-stone-500 font-medium">Deadline From</label>
              <input type="date" value={filters.deadline_from}
                onChange={e => setFilters(p => ({ ...p, deadline_from: e.target.value }))} className={fieldCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-stone-500 font-medium">Deadline To</label>
              <input type="date" value={filters.deadline_to}
                onChange={e => setFilters(p => ({ ...p, deadline_to: e.target.value }))} className={fieldCls} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all shadow-sm">
              Apply Filters
            </button>
            <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); setAppliedFilters(EMPTY_FILTERS) }}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-600 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 transition-all dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600">
              Clear
            </button>
          </div>
        </form>

        {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-base text-red-800">{error}</div>}

        {/* Bulk action toolbar — only for department_head and admin */}
        {canBulkAction && selectedIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-card dark:bg-amber-900/20 dark:border-amber-800/40">
            <span className="text-sm font-bold text-stone-800 dark:text-stone-200">{selectedIds.length} selected</span>
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => setConfirmAction('complete')}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-all shadow-sm"
            >
              Mark Complete
            </button>
            <div className="flex items-center gap-2">
              <select
                value={bulkPriority}
                onChange={e => setBulkPriority(e.target.value as Priority)}
                className="rounded-xl border border-amber-200 dark:border-amber-700 px-3 py-1.5 text-sm text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[36px]"
                aria-label="Select priority"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={bulkLoading}
                onClick={() => setConfirmAction('priority')}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 transition-all shadow-sm"
              >
                Set Priority
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="ml-auto min-h-[36px] px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-stone-800 text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
            >
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-card border border-stone-200 overflow-hidden dark:bg-stone-900 dark:border-stone-700">
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 py-16 text-stone-400 dark:text-stone-500">
              <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400 dark:text-stone-500">
              <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-base font-medium text-stone-600 dark:text-stone-400">No documents found</p>
              <p className="text-sm mt-1">Try adjusting your filters or create a new document.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-base text-left">
                <thead className="sticky top-0 bg-stone-50 border-b border-stone-200 z-10 dark:bg-stone-800 dark:border-stone-700">
                  <tr>
                    {canBulkAction && (
                      <th className="px-4 py-3 w-10">
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          aria-label="Select all documents"
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                        />
                      </th>
                    )}
                    {['Tracking #', 'Title', 'Category', 'Status', 'Priority', 'Current Dept', 'Deadline', 'Last Updated'].map(h => (
                      <th key={h} className="px-4 py-3 font-semibold text-stone-500 whitespace-nowrap text-xs uppercase tracking-wider dark:text-stone-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
                  {documents.map(doc => {
                    const docId = String(doc.id)
                    const isSelected = selectedIds.includes(docId)
                    return (
                      <tr key={doc.id}
                        className={`transition-colors ${doc.is_overdue ? 'border-l-4 border-red-500' : ''} ${isSelected ? 'bg-amber-50/60 dark:bg-amber-900/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'}`}>
                        {canBulkAction && (
                          <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(docId)}
                              aria-label={`Select document ${doc.tracking_number}`}
                              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono text-sm text-stone-700 whitespace-nowrap cursor-pointer dark:text-stone-300" onClick={() => navigate(`/documents/${doc.id}`)}>{doc.tracking_number}</td>
                        <td className="px-4 py-3 text-stone-900 max-w-xs cursor-pointer dark:text-stone-100" onClick={() => navigate(`/documents/${doc.id}`)}><span className="line-clamp-2">{doc.title}</span></td>
                        <td className="px-4 py-3 text-stone-600 whitespace-nowrap cursor-pointer dark:text-stone-400" onClick={() => navigate(`/documents/${doc.id}`)}>{doc.category.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => navigate(`/documents/${doc.id}`)}><StatusBadge status={doc.status} /></td>
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => navigate(`/documents/${doc.id}`)}><PriorityBadge priority={doc.priority} /></td>
                        <td className="px-4 py-3 text-stone-600 whitespace-nowrap cursor-pointer dark:text-stone-400" onClick={() => navigate(`/documents/${doc.id}`)}>{doc.current_department.code}</td>
                        <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => navigate(`/documents/${doc.id}`)}><DeadlineBadge deadline={doc.deadline} isOverdue={doc.is_overdue} /></td>
                        <td className="px-4 py-3 text-stone-500 whitespace-nowrap text-sm cursor-pointer dark:text-stone-400" onClick={() => navigate(`/documents/${doc.id}`)}>{formatUpdated(doc.updated_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <p className="text-xs text-stone-500 dark:text-stone-400">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="min-h-[36px] px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">
                ← Prev
              </button>
              <span className="flex items-center px-3 text-sm text-stone-500 dark:text-stone-400">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="min-h-[36px] px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm dialog for bulk actions */}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction === 'complete' ? 'Mark as Complete' : 'Set Priority'}
          message={confirmMessage}
          confirmLabel={confirmAction === 'complete' ? 'Mark Complete' : 'Set Priority'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
