import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useApiQuery, useApiMutation } from '../hooks/useApi'
import Skeleton from '../components/Skeleton'

interface PendingApproval {
  id: string; document_id: string; step_order: number; label: string; status: string
  created_at: string; tracking_number: string; title: string; doc_status: string; creator_name: string
}
interface Flow {
  id: string; name: string; description: string | null; is_active: boolean
  created_by_name: string; created_at: string
}
interface FlowStep {
  id: string; flow_id: string; step_order: number; label: string
  approver_role: string | null; department_code: string | null; department_name: string | null
  approver_name: string | null
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ApprovalsPage() {
  useDocumentTitle('Approvals')
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'pending' | 'flows'>('pending')

  const { data: pending = [], refetch: refetchPending } = useApiQuery<PendingApproval[]>('/api/approvals/pending', { retry: false })
  const { data: flows = [], isLoading: flowsLoading, refetch: refetchFlows } = useApiQuery<Flow[]>('/api/approvals/flows', { retry: false, enabled: isAdmin })

  const approveMutation = useApiMutation(`/api/approvals/approve`, 'POST', {
    onSuccess: () => refetchPending(),
  })
  const rejectMutation = useApiMutation(`/api/approvals/reject`, 'POST', {
    onSuccess: () => refetchPending(),
  })

  async function handleApprove(id: string) {
    await approveMutation.mutateAsync({ approval_id: id, comment: '' })
  }

  async function handleReject(id: string) {
    const comment = prompt('Reason for rejection:')
    if (!comment) return
    await rejectMutation.mutateAsync({ approval_id: id, comment })
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">Approvals</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {pending.length > 0 ? `${pending.length} item${pending.length !== 1 ? 's' : ''} awaiting review` : 'All caught up'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5">
              <button onClick={() => setTab('pending')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'pending' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}>
                Pending {pending.length > 0 && <span className="ml-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full text-[10px]">{pending.length}</span>}
              </button>
              <button onClick={() => setTab('flows')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'flows' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}>
                Flows
              </button>
            </div>
          )}
        </div>

        {/* Pending Approvals */}
        {(tab === 'pending' || !isAdmin) && (
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
                {pending.map(p => (
                  <li key={p.id} className="px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-stone-400 dark:text-stone-500">{p.tracking_number}</span>
                          <span className="text-[11px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Step {p.step_order}</span>
                        </div>
                        <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{p.title}</p>
                        <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                          {p.label} · by {p.creator_name} · {timeAgo(p.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => navigate(`/documents/${p.document_id}`)}
                          className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                          View
                        </button>
                        <button onClick={() => handleApprove(p.id)} disabled={approveMutation.isPending}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                          Approve
                        </button>
                        <button onClick={() => handleReject(p.id)} disabled={rejectMutation.isPending}
                          className="px-2.5 py-1.5 rounded-lg bg-red-500 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                          Reject
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Admin: Flow Management */}
        {isAdmin && tab === 'flows' && <FlowManagement flows={flows} flowsLoading={flowsLoading} refetchFlows={refetchFlows} token={token} />}
      </div>
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
  const [addingStep, setAddingStep] = useState(false)
  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    if (stepsMap[flowId]) { setExpandedFlow(expandedFlow === flowId ? null : flowId); return }
    fetch(`/api/approvals/flows/${flowId}/steps`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setStepsMap(prev => ({ ...prev, [flowId]: data })); setExpandedFlow(flowId) })
  }

  async function handleAddStep(flowId: string, e: React.FormEvent) {
    e.preventDefault()
    if (!stepLabel.trim()) return
    setAddingStep(true)
    try {
      await fetch(`/api/approvals/flows/${flowId}/steps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: stepLabel.trim() })
      })
      const r = await fetch(`/api/approvals/flows/${flowId}/steps`, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const steps = await r.json(); setStepsMap(prev => ({ ...prev, [flowId]: steps })) }
      setStepLabel(''); setShowAddStep(null)
    } finally { setAddingStep(false) }
  }

  async function handleDeleteStep(flowId: string, stepId: string) {
    await fetch(`/api/approvals/flows/${flowId}/steps/${stepId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    setStepsMap(prev => ({ ...prev, [flowId]: prev[flowId].filter(s => s.id !== stepId) }))
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
          <button onClick={() => setShowCreate(true)}
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
                        {stepsMap[f.id].map(s => (
                          <div key={s.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-stone-50 dark:bg-stone-800/60">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[10px] font-bold text-stone-500">{s.step_order}</span>
                              <span className="text-xs text-stone-700 dark:text-stone-300">{s.label}</span>
                              {s.department_code && <span className="text-[11px] text-stone-400">{s.department_code}</span>}
                              {s.approver_name && <span className="text-[11px] text-stone-400">→ {s.approver_name}</span>}
                            </div>
                            <button onClick={() => handleDeleteStep(f.id, s.id)} className="text-[11px] text-red-500 hover:text-red-600">Remove</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 mb-2">No steps yet</p>
                    )}
                    {showAddStep === f.id ? (
                      <form onSubmit={e => handleAddStep(f.id, e)} className="flex gap-2">
                        <input value={stepLabel} onChange={e => setStepLabel(e.target.value)} placeholder="Step label" required
                          className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        <button type="submit" disabled={addingStep}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">Add</button>
                        <button type="button" onClick={() => setShowAddStep(null)}
                          className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-xs text-stone-500">Cancel</button>
                      </form>
                    ) : (
                      <button onClick={() => setShowAddStep(f.id)} className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400">+ Add Step</button>
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
