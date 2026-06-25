import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiQuery, useApiMutation } from '../hooks/useApi'
import Skeleton from '../components/Skeleton'

interface PendingApproval {
  id: string; document_id: string; step_order: number; label: string; status: string
  created_at: string; tracking_number: string; title: string; description: string | null
  doc_status: string; creator_name: string; priority: string; deadline: string | null
  doc_created_at: string; total_steps: string; approved_steps: string
}
interface Flow {
  id: string; name: string; description: string | null; is_active: boolean
  created_by_name: string; created_at: string
}
interface FlowStep {
  id: string; flow_id: string; step_order: number; label: string
  approver_role: string | null; department_id: string | null; department_name: string | null
  department_code: string | null; approver_name: string | null; approver_id: string | null
}
interface HistoryEntry {
  id: string; document_id: string; step_order: number; label: string; status: string
  comment: string | null; decided_at: string; tracking_number: string; title: string
  priority: string; decided_by_name: string; creator_name: string
}
interface Dept { id: string; code: string; name: string }
interface User { id: string; full_name: string; role: string; department_id: string }

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function deadlineLabel(d: string | null) {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' }
  if (diff === 0) return { text: 'Due today', color: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' }
  if (diff <= 3) return { text: `${diff}d left`, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' }
  return { text: `${diff}d left`, color: 'text-stone-500 bg-stone-100 dark:bg-stone-700 dark:text-stone-400' }
}

function priorityBadge(p: string) {
  const m: Record<string, string> = {
    urgent: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
    normal: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400',
    low: 'bg-stone-50 text-stone-400 dark:bg-stone-800 dark:text-stone-500',
  }
  return m[p] || m.normal
}

export default function ApprovalsPage() {
  useDocumentTitle('Approvals')
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'pending' | 'flows' | 'history'>('pending')
  const headerCheckRef = useRef<HTMLInputElement>(null)

  const { data: pending = [], refetch: refetchPending } = useApiQuery<PendingApproval[]>('/api/approvals/pending', { retry: false })
  const { data: flows = [], isLoading: flowsLoading, refetch: refetchFlows } = useApiQuery<Flow[]>('/api/approvals/flows', { retry: false, enabled: isAdmin && tab === 'flows' })
  const { data: history = [], isLoading: historyLoading } = useApiQuery<HistoryEntry[]>('/api/approvals/history', { retry: false, enabled: tab === 'history' })

  const approveMutation = useApiMutation('/api/approvals/approve', 'POST', { onSuccess: () => refetchPending() })
  const rejectMutation = useApiMutation('/api/approvals/reject', 'POST', { onSuccess: () => refetchPending() })
  const bulkApproveMutation = useApiMutation('/api/approvals/bulk-approve', 'POST', { onSuccess: () => { setSelectedIds([]); refetchPending() } })
  const bulkRejectMutation = useApiMutation('/api/approvals/bulk-reject', 'POST', { onSuccess: () => { setSelectedIds([]); refetchPending() } })

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expandedSteps, setExpandedSteps] = useState<Record<string, { label: string; status: string }[]>>({})

  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject' | 'bulk-approve' | 'bulk-reject'; id?: string; title?: string } | null>(null)
  const [actionComment, setActionComment] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.length === pending.length) setSelectedIds([])
    else setSelectedIds(pending.map(p => p.id))
  }, [selectedIds.length, pending])

  async function loadSteps(docId: string) {
    if (expandedSteps[docId]) { setExpandedSteps(prev => { const n = { ...prev }; delete n[docId]; return n }); return }
    try {
      const t = token ?? localStorage.getItem('noneco_token') ?? ''
      const res = await fetch(`/api/approvals/${docId}/approvals`, { headers: { Authorization: `Bearer ${t}` } })
      if (res.ok) {
        const steps = await res.json()
        setExpandedSteps(prev => ({ ...prev, [docId]: steps.map((s: { label: string; status: string }) => ({ label: s.label, status: s.status })) }))
      }
    } catch {}
  }

  async function executeAction() {
    if (!actionModal) return
    setActionLoading(true)
    try {
      if (actionModal.type === 'approve' && actionModal.id) {
        await approveMutation.mutateAsync({ approval_id: actionModal.id, comment: actionComment || '' })
      } else if (actionModal.type === 'reject' && actionModal.id) {
        await rejectMutation.mutateAsync({ approval_id: actionModal.id, comment: actionComment })
      } else if (actionModal.type === 'bulk-approve') {
        await bulkApproveMutation.mutateAsync({ approval_ids: selectedIds, comment: actionComment || '' })
      } else if (actionModal.type === 'bulk-reject') {
        await bulkRejectMutation.mutateAsync({ approval_ids: selectedIds, comment: actionComment })
      }
      setActionModal(null); setActionComment('')
    } catch {}
    setActionLoading(false)
  }

  const isAllSelected = pending.length > 0 && selectedIds.length === pending.length
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < pending.length

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.checked = isAllSelected
      headerCheckRef.current.indeterminate = isSomeSelected
    }
  }, [isAllSelected, isSomeSelected])

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">Approvals</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {tab === 'pending' ? (pending.length > 0 ? `${pending.length} item${pending.length !== 1 ? 's' : ''} awaiting review` : 'All caught up') : tab === 'history' ? 'Past decisions' : 'Manage approval workflows'}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
            <button onClick={() => setTab('pending')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'pending' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}>
              Pending {pending.length > 0 && <span className="ml-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full text-[10px]">{pending.length}</span>}
            </button>
            {isAdmin && (
              <button onClick={() => setTab('flows')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'flows' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}>
                Flows
              </button>
            )}
            <button onClick={() => setTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'history' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}>
              History
            </button>
          </div>
        </div>

        {/* Bulk toolbar */}
        {tab === 'pending' && pending.length > 0 && (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all ${selectedIds.length > 0 ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/40' : 'bg-white border-stone-200 dark:bg-stone-900 dark:border-stone-800'}`}>
            <div className="flex items-center gap-2">
              <input ref={headerCheckRef} type="checkbox" onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-stone-300 text-amber-600 focus:ring-amber-400" />
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : `${pending.length} items`}
              </span>
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setActionModal({ type: 'bulk-approve' })}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700 transition-colors">
                  Approve ({selectedIds.length})
                </button>
                <button onClick={() => setActionModal({ type: 'bulk-reject' })}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-xs font-medium text-white hover:bg-red-600 transition-colors">
                  Reject ({selectedIds.length})
                </button>
                <button onClick={() => setSelectedIds([])}
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-xs text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* Pending Approvals */}
        {tab === 'pending' && (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
              <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Pending Your Review</h2>
            </div>
            {pending.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-sm text-stone-500 dark:text-stone-400">No pending approvals</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-50 dark:divide-stone-800">
                {pending.map(p => {
                  const total = Number(p.total_steps) || 1
                  const approved = Number(p.approved_steps) || 0
                  const dl = deadlineLabel(p.deadline)
                  return (
                    <li key={p.id} className={`px-4 py-3 transition-colors ${selectedIds.includes(p.id) ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)}
                          className="w-4 h-4 mt-1 rounded border-stone-300 text-amber-600 focus:ring-amber-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-mono text-stone-400 dark:text-stone-500">{p.tracking_number}</span>
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${priorityBadge(p.priority)}`}>{p.priority}</span>
                            <span className="text-[11px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Step {p.step_order}</span>
                            {dl && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${dl.color}`}>{dl.text}</span>}
                          </div>
                          <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{p.title}</p>
                          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                            {p.label} · by {p.creator_name} · {timeAgo(p.created_at)}
                          </p>

                          {/* Progress stepper */}
                          <div className="flex items-center gap-1 mt-2">
                            {Array.from({ length: total }, (_, i) => (
                              <div key={i} className={`h-1.5 rounded-full flex-1 max-w-[60px] ${i < approved ? 'bg-emerald-500' : i === p.step_order - 1 ? 'bg-amber-400' : 'bg-stone-200 dark:bg-stone-700'}`} />
                            ))}
                            <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-1">{approved}/{total}</span>
                          </div>

                          {/* Expandable step details */}
                          {expandedSteps[p.document_id] && (
                            <div className="mt-2 pl-2 border-l-2 border-stone-100 dark:border-stone-700 space-y-1">
                              {expandedSteps[p.document_id].map((s, i) => (
                                <div key={i} className="flex items-center gap-2 text-[11px]">
                                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${s.status === 'approved' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' : s.status === 'rejected' ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : s.status === 'pending' && i + 1 === p.step_order ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-stone-100 text-stone-400 dark:bg-stone-700 dark:text-stone-500'}`}>
                                    {s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✗' : i + 1}
                                  </span>
                                  <span className={`${s.status === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : s.status === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-stone-600 dark:text-stone-300'}`}>{s.label}</span>
                                  <span className="text-stone-400 dark:text-stone-500 capitalize">· {s.status}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          <button onClick={() => { loadSteps(p.document_id) }}
                            className="px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700 text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                            {expandedSteps[p.document_id] ? 'Hide' : 'Steps'}
                          </button>
                          <button onClick={() => navigate(`/documents/${p.document_id}`)}
                            className="px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700 text-[11px] font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                            View
                          </button>
                          <button onClick={() => setActionModal({ type: 'approve', id: p.id, title: p.title })}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-[11px] font-medium text-white hover:bg-emerald-700 transition-colors">
                            Approve
                          </button>
                          <button onClick={() => setActionModal({ type: 'reject', id: p.id, title: p.title })}
                            className="px-2.5 py-1 rounded-lg bg-red-500 text-[11px] font-medium text-white hover:bg-red-600 transition-colors">
                            Reject
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* Admin: Flow Management */}
        {isAdmin && tab === 'flows' && <FlowManagement flows={flows} flowsLoading={flowsLoading} refetchFlows={refetchFlows} token={token} />}

        {/* History */}
        {tab === 'history' && (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
              <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Approval History</h2>
            </div>
            {historyLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
            ) : history.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-sm text-stone-500 dark:text-stone-400">No approval history yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-50 dark:divide-stone-800">
                {history.map(h => (
                  <li key={h.id} className="px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors cursor-pointer" onClick={() => navigate(`/documents/${h.document_id}`)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-stone-400 dark:text-stone-500">{h.tracking_number}</span>
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${priorityBadge(h.priority)}`}>{h.priority}</span>
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${h.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {h.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{h.title}</p>
                        <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                          Step {h.step_order}: {h.label} · by {h.creator_name}
                        </p>
                        {h.comment && (
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 italic">"{h.comment}"</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-stone-400 dark:text-stone-500">{h.decided_by_name}</p>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500">{timeAgo(h.decided_at)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Action Modal (Approve / Reject) */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setActionModal(null); setActionComment('') }} />
          <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-2xl">
            <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {actionModal.type === 'approve' || actionModal.type === 'bulk-approve' ? 'Approve' : 'Reject'}
                {actionModal.type.startsWith('bulk') ? ` (${selectedIds.length} items)` : ''}
              </h3>
              {actionModal.title && <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 truncate">{actionModal.title}</p>}
            </div>
            <div className="px-5 py-4 space-y-3">
              {(actionModal.type === 'reject' || actionModal.type === 'bulk-reject') && (
                <p className="text-xs text-red-600 dark:text-red-400">Reason for rejection is required.</p>
              )}
              <textarea
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                placeholder={actionModal.type === 'approve' || actionModal.type === 'bulk-approve' ? 'Optional comment…' : 'Reason for rejection…'}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>
            <div className="px-5 py-3 border-t border-stone-100 dark:border-stone-700 flex gap-2">
              <button onClick={() => { setActionModal(null); setActionComment('') }}
                className="flex-1 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                Cancel
              </button>
              <button onClick={executeAction} disabled={actionLoading || ((actionModal.type === 'reject' || actionModal.type === 'bulk-reject') && !actionComment.trim())}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-colors ${
                  actionModal.type === 'approve' || actionModal.type === 'bulk-approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}>
                {actionLoading ? 'Processing…' : (actionModal.type === 'approve' || actionModal.type === 'bulk-approve') ? 'Confirm Approve' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FlowManagement({ flows, flowsLoading, refetchFlows, token }: {
  flows: Flow[]; flowsLoading: boolean; refetchFlows: () => void; token: string | null
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null)
  const [stepsMap, setStepsMap] = useState<Record<string, FlowStep[]>>({})
  const [showAddStep, setShowAddStep] = useState<string | null>(null)
  const [stepLabel, setStepLabel] = useState('')
  const [stepDeptId, setStepDeptId] = useState('')
  const [stepApproverId, setStepApproverId] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [departments, setDepartments] = useState<Dept[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  function loadDropdownData() {
    if (departments.length > 0) return
    const t = token ?? localStorage.getItem('noneco_token') ?? ''
    const headers = { Authorization: `Bearer ${t}` }
    fetch('/api/departments', { headers }).then(r => r.json()).then(d => setDepartments(Array.isArray(d) ? d : [])).catch(() => {})
    fetch('/api/users', { headers }).then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {})
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/approvals/flows', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null })
      })
      if (res.ok) { refetchFlows(); setShowCreate(false); setNewName(''); setNewDesc('') }
    } finally { setCreating(false) }
  }

  function loadSteps(flowId: string) {
    if (expandedFlow === flowId) { setExpandedFlow(null); return }
    fetch(`/api/approvals/flows/${flowId}/steps`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setStepsMap(prev => ({ ...prev, [flowId]: data })); setExpandedFlow(flowId) })
    loadDropdownData()
  }

  async function handleAddStep(flowId: string, e: React.FormEvent) {
    e.preventDefault()
    if (!stepLabel.trim()) return
    setAddingStep(true)
    try {
      await fetch(`/api/approvals/flows/${flowId}/steps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: stepLabel.trim(), department_id: stepDeptId || null, approver_id: stepApproverId || null })
      })
      const r = await fetch(`/api/approvals/flows/${flowId}/steps`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const steps = await r.json(); setStepsMap(prev => ({ ...prev, [flowId]: steps })) }
      setStepLabel(''); setStepDeptId(''); setStepApproverId(''); setShowAddStep(null)
    } finally { setAddingStep(false) }
  }

  async function handleDeleteStep(flowId: string, stepId: string) {
    await fetch(`/api/approvals/flows/${flowId}/steps/${stepId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setStepsMap(prev => ({ ...prev, [flowId]: (prev[flowId] || []).filter(s => s.id !== stepId) }))
  }

  function handleStepDrag(flowId: string, fromIdx: number, toIdx: number) {
    setDragIdx(null); setOverIdx(null)
    setStepsMap(prev => {
      const steps = [...(prev[flowId] || [])]
      const [moved] = steps.splice(fromIdx, 1)
      steps.splice(toIdx, 0, moved)
      const updated = { ...prev, [flowId]: steps }
      const t = token ?? localStorage.getItem('noneco_token') ?? ''
      fetch(`/api/approvals/flows/${flowId}/steps/reorder`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ordered_ids: steps.map(s => s.id) })
      }).catch(() => {})
      return updated
    })
  }

  async function handleToggle(flow: Flow) {
    await fetch(`/api/approvals/flows/${flow.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !flow.is_active })
    })
    refetchFlows()
  }

  async function handleDeleteFlow() {
    if (!deleteFlowId) return
    setDeleting(true)
    try {
      await fetch(`/api/approvals/flows/${deleteFlowId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      refetchFlows(); setDeleteFlowId(null)
    } finally { setDeleting(false) }
  }

  return (
    <>
      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200">Approval Flows</h2>
          <button onClick={() => { setShowCreate(true); loadDropdownData() }}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 transition-colors">
            + New Flow
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 space-y-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Flow name" required
              className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={2}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            <div className="flex gap-2">
              <button type="submit" disabled={creating}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">{creating ? 'Creating…' : 'Create'}</button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700">Cancel</button>
            </div>
          </form>
        )}

        {flowsLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
        ) : flows.length === 0 ? (
          <div className="py-12 text-center text-sm text-stone-400 dark:text-stone-500">No approval flows yet</div>
        ) : (
          <ul className="divide-y divide-stone-50 dark:divide-stone-800">
            {flows.map(f => (
              <li key={f.id}>
                <div className="px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{f.name}</span>
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${f.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400'}`}>
                          {f.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      {f.description && <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 truncate">{f.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => loadSteps(f.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                        {expandedFlow === f.id ? 'Hide' : 'Steps'}
                      </button>
                      <button onClick={() => handleToggle(f)}
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                        {f.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => setDeleteFlowId(f.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800/40 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                {expandedFlow === f.id && (
                  <div className="px-4 pb-3 border-t border-stone-100 dark:border-stone-800 pt-2">
                    {stepsMap[f.id]?.length > 0 ? (
                      <div className="space-y-1 mb-2">
                        {stepsMap[f.id].map((s, idx) => (
                          <div key={s.id}
                            draggable
                            onDragStart={() => setDragIdx(idx)}
                            onDragOver={e => { e.preventDefault(); setOverIdx(idx) }}
                            onDrop={() => { if (dragIdx !== null && dragIdx !== idx) handleStepDrag(f.id, dragIdx, idx) }}
                            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                            className={`flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg transition-all cursor-grab active:cursor-grabbing ${dragIdx === idx ? 'opacity-50' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'border-t-2 border-amber-400' : ''} bg-stone-50 dark:bg-stone-800/60`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-stone-300 dark:text-stone-600 cursor-grab">⋮⋮</span>
                              <span className="w-5 h-5 rounded bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[10px] font-bold text-stone-500 shrink-0">{s.step_order}</span>
                              <span className="text-xs text-stone-700 dark:text-stone-300 truncate">{s.label}</span>
                              {s.department_name && <span className="text-[10px] text-stone-400 bg-stone-100 dark:bg-stone-700 px-1 py-0.5 rounded shrink-0">{s.department_code}</span>}
                              {s.approver_name && <span className="text-[10px] text-stone-400 shrink-0">→ {s.approver_name}</span>}
                            </div>
                            <button onClick={() => handleDeleteStep(f.id, s.id)} className="text-[11px] text-red-500 hover:text-red-600 shrink-0">Remove</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 mb-2">No steps yet</p>
                    )}
                    {showAddStep === f.id ? (
                      <form onSubmit={e => handleAddStep(f.id, e)} className="space-y-2">
                        <input value={stepLabel} onChange={e => setStepLabel(e.target.value)} placeholder="Step label" required
                          className="w-full px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        <div className="flex gap-2">
                          <select value={stepDeptId} onChange={e => { setStepDeptId(e.target.value); setStepApproverId('') }}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400">
                            <option value="">Any department</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                          <select value={stepApproverId} onChange={e => setStepApproverId(e.target.value)}
                            disabled={!stepDeptId}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50">
                            <option value="">Any approver</option>
                            {users.filter(u => !stepDeptId || u.department_id === stepDeptId).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" disabled={addingStep}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">{addingStep ? 'Adding…' : 'Add'}</button>
                          <button type="button" onClick={() => { setShowAddStep(null); setStepLabel(''); setStepDeptId(''); setStepApproverId('') }}
                            className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-xs text-stone-500">Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => { setShowAddStep(f.id); loadDropdownData() }} className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400">+ Add Step</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteFlowId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteFlowId(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">Delete approval flow?</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">Documents using this flow will lose their approval assignments.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteFlowId(null)}
                className="flex-1 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700">Cancel</button>
              <button onClick={handleDeleteFlow} disabled={deleting}
                className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
