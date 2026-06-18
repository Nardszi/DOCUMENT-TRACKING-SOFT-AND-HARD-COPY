import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import DeadlineBadge from '../components/DeadlineBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { useToast } from '../components/ToastContainer'

interface Department { id: number; code: string; name: string }
interface Document {
  id: number; tracking_number: string; title: string
  category: { id: number; name: string }
  current_department: { id: number; code: string; name: string }
  status: string; priority: string; deadline: string | null
  is_overdue: boolean; updated_at: string
}
type Tab = 'my' | 'department'

const PAGE_SIZE = 25

function formatUpdated(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DepartmentDocumentsPage() {
  const { token, user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('department')
  const [documents, setDocuments] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [department, setDepartment] = useState<Department | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmAction, setConfirmAction] = useState<'complete' | 'delete' | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  useEffect(() => {
    if (!user?.departmentId) return
    fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const depts: Department[] = Array.isArray(data) ? data : []
        const found = depts.find(d => String(d.id) === String(user.departmentId))
        if (found) setDepartment(found)
      })
      .catch(() => {})
  }, [user, token])

  const fetchDocuments = useCallback(async (t: Tab, p: number) => {
    if (!user?.departmentId) return
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) })
      if (t === 'department') {
        params.set('department_id', String(user.departmentId))
      } else {
        params.set('created_by', String(user.id))
      }
      const res = await fetch(`/api/documents?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDocuments(data.data ?? []); setTotal(data.total ?? 0); setTotalPages(data.totalPages ?? 1)
    } catch { setError('Failed to load documents.') }
    finally { setLoading(false) }
  }, [user, token])

  useEffect(() => { fetchDocuments(tab, page) }, [tab, page, fetchDocuments])
  useEffect(() => { setSelectedIds([]) }, [tab, page])

  const canBulkAction = user?.role === 'department_head' || user?.role === 'admin'

  function toggleSelectAll() {
    if (selectedIds.length === documents.length) setSelectedIds([])
    else setSelectedIds(documents.map(d => String(d.id)))
  }

  function toggleSelectOne(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
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
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed')
      showToast(`${data.completed} marked complete.${data.skipped > 0 ? ` ${data.skipped} skipped.` : ''}`, 'success')
      setSelectedIds([]); fetchDocuments(tab, page)
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : 'Failed', 'error') }
    finally { setBulkLoading(false); setConfirmAction(null) }
  }

  async function executeBulkDelete() {
    setBulkLoading(true)
    try {
      const res = await fetch('/api/documents/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_ids: selectedIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message ?? 'Failed')
      showToast(`${data.deleted} deleted.`, 'success')
      setSelectedIds([]); fetchDocuments(tab, page)
    } catch (err: unknown) { showToast(err instanceof Error ? err.message : 'Failed', 'error') }
    finally { setBulkLoading(false); setConfirmAction(null) }
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {tab === 'department'
                ? (department ? `${department.code} — ${department.name}` : 'My Department')
                : 'My Documents'}
            </h1>
            <p className="text-stone-400 text-sm mt-0.5">
              {tab === 'department'
                ? `Documents currently in your department (${total})`
                : `Documents you created (${total})`}
            </p>
          </div>
          <Link to="/documents/new"
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-stone-900 shadow-sm transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Create Document
          </Link>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-3 sm:px-4 py-4 sm:py-5">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-white rounded-2xl shadow-card border border-stone-200 p-1 dark:bg-stone-800/80 dark:border-stone-700">
          <button onClick={() => { setTab('department'); setPage(1) }}
            className={`flex-1 min-h-[40px] rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 ${tab === 'department' ? 'bg-amber-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
            Department Documents
          </button>
          <button onClick={() => { setTab('my'); setPage(1) }}
            className={`flex-1 min-h-[40px] rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 ${tab === 'my' ? 'bg-amber-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>
            My Documents
          </button>
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-base text-red-800">{error}</div>}

        {/* Bulk action toolbar */}
        {canBulkAction && selectedIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-card dark:bg-amber-900/20 dark:border-amber-800/40">
            <span className="text-sm font-bold text-stone-800 dark:text-stone-200">{selectedIds.length} selected</span>
            <button type="button" disabled={bulkLoading} onClick={() => setConfirmAction('complete')}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm">Mark Complete</button>
            {user?.role === 'admin' && (
              <button type="button" disabled={bulkLoading} onClick={() => setConfirmAction('delete')}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-all shadow-sm">Delete Selected</button>
            )}
            <button type="button" onClick={() => setSelectedIds([])}
              className="ml-auto min-h-[36px] px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-700 bg-white dark:bg-stone-800 text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-stone-700 transition-all">Clear</button>
          </div>
        )}

        {/* Document list */}
        <div className="bg-white rounded-2xl shadow-card border border-stone-200 overflow-hidden dark:bg-stone-900 dark:border-stone-700">
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 py-16 text-stone-400 dark:text-stone-500">
              <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-stone-400 dark:text-stone-500">
              <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-base font-medium text-stone-600 dark:text-stone-400">No documents found</p>
              <p className="text-sm mt-1">{tab === 'department' ? 'No documents are currently in your department.' : "You haven't created any documents yet."}</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-base text-left">
                  <thead className="sticky top-0 bg-stone-50 border-b border-stone-200 z-10 dark:bg-stone-800 dark:border-stone-700">
                    <tr>
                      {canBulkAction && (
                        <th className="px-4 py-3 w-10">
                          <input type="checkbox" aria-label="Select all" onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer" />
                        </th>
                      )}
                      {['Tracking #', 'Title', 'Status', 'Priority', 'Dept', 'Deadline', 'Updated'].map(h => (
                        <th key={h} className="px-4 py-3 font-semibold text-stone-500 whitespace-nowrap text-xs uppercase tracking-wider dark:text-stone-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
                    {documents.map(doc => {
                      const docId = String(doc.id)
                      const isSelected = selectedIds.includes(docId)
                      return (
                        <tr key={doc.id} className={`transition-colors ${doc.is_overdue ? 'border-l-4 border-red-500' : ''} ${isSelected ? 'bg-amber-50/60 dark:bg-amber-900/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'}`}>
                          {canBulkAction && (
                            <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(docId)}
                                aria-label={`Select ${doc.tracking_number}`}
                                className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer" />
                            </td>
                          )}
                          <td className="px-4 py-3 font-mono text-sm text-stone-700 whitespace-nowrap cursor-pointer dark:text-stone-300" onClick={() => navigate(`/documents/${doc.id}`)}>{doc.tracking_number}</td>
                          <td className="px-4 py-3 text-stone-900 max-w-xs cursor-pointer dark:text-stone-100" onClick={() => navigate(`/documents/${doc.id}`)}><span className="line-clamp-2">{doc.title}</span></td>
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
              <ul className="md:hidden divide-y divide-stone-100 dark:divide-stone-700/60">
                {documents.map(doc => {
                  return (
                    <li key={doc.id} className={`px-4 py-3.5 transition-colors ${doc.is_overdue ? 'border-l-4 border-red-500' : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'}`}>
                      <button className="w-full text-left min-w-0" onClick={() => navigate(`/documents/${doc.id}`)}>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[11px] font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded dark:bg-stone-700 dark:text-stone-500">{doc.tracking_number}</span>
                          {doc.is_overdue && <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">OVERDUE</span>}
                        </div>
                        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-snug mb-2">{doc.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <StatusBadge status={doc.status} />
                          <PriorityBadge priority={doc.priority} />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-400">
                          <span>{doc.current_department.code}</span>
                          {doc.deadline && <><span>·</span><DeadlineBadge deadline={doc.deadline} isOverdue={doc.is_overdue} /></>}
                          <span>·</span>
                          <span>{formatUpdated(doc.updated_at)}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <p className="text-xs text-stone-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="min-h-[36px] px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">← Prev</button>
              <span className="flex items-center px-3 text-sm text-stone-500">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="min-h-[36px] px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">Next →</button>
            </div>
          </div>
        )}

        {confirmAction && (
          <ConfirmDialog
            title={confirmAction === 'complete' ? 'Mark as Complete' : 'Delete Documents'}
            message={confirmAction === 'complete' ? `Mark ${selectedIds.length} document(s) as complete?` : `Permanently delete ${selectedIds.length} document(s)?`}
            confirmLabel={confirmAction === 'complete' ? 'Mark Complete' : 'Delete'}
            danger={confirmAction === 'delete'}
            onConfirm={confirmAction === 'complete' ? executeBulkComplete : executeBulkDelete}
            onCancel={() => setConfirmAction(null)} />
        )}
      </div>
    </div>
  )
}
