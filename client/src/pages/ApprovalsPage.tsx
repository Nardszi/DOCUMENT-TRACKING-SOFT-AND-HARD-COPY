import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

interface PendingApproval {
  id: string
  document_id: string
  step_order: number
  label: string
  status: string
  created_at: string
  tracking_number: string
  title: string
  doc_status: string
  creator_name: string
}

interface Flow {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_by_name: string
  created_at: string
}

interface FlowStep {
  id: string
  flow_id: string
  step_order: number
  label: string
  approver_role: string | null
  department_id: string | null
  department_code: string | null
  department_name: string | null
  approver_id: string | null
  approver_name: string | null
}

function formatDateTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ApprovalsPage() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState<PendingApproval[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [flowsLoading, setFlowsLoading] = useState(true)
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null)
  const [stepsMap, setStepsMap] = useState<Record<string, FlowStep[]>>({})
  const [showCreateFlow, setShowCreateFlow] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [newFlowDesc, setNewFlowDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showAddStep, setShowAddStep] = useState<string | null>(null)
  const [stepLabel, setStepLabel] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!token) return
    // Fetch pending approvals
    fetch('/api/approvals/pending', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPending(data))
      .catch(() => console.warn('Failed to load pending approvals'))
    // Fetch flows
    if (isAdmin) {
      fetch('/api/approvals/flows', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => { setFlows(data); setFlowsLoading(false) })
        .catch(() => { setFlowsLoading(false); console.warn('Failed to load flows') })
    } else {
      setFlowsLoading(false)
    }
  }, [token, isAdmin])

  function loadSteps(flowId: string) {
    if (stepsMap[flowId]) {
      setExpandedFlow(expandedFlow === flowId ? null : flowId)
      return
    }
    fetch(`/api/approvals/flows/${flowId}/steps`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setStepsMap(prev => ({ ...prev, [flowId]: data }))
        setExpandedFlow(flowId)
      })
      .catch(() => console.warn('Failed to load steps'))
  }

  async function handleCreateFlow(e: React.FormEvent) {
    e.preventDefault()
    if (!newFlowName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/approvals/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newFlowName.trim(), description: newFlowDesc.trim() || null })
      })
      if (!res.ok) throw new Error('Failed to create flow')
      const data = await res.json()
      setFlows(prev => [...prev, { id: data.id, name: newFlowName.trim(), description: newFlowDesc.trim() || null, is_active: true, created_by_name: user?.fullName || '', created_at: new Date().toISOString() }])
      setShowCreateFlow(false)
      setNewFlowName('')
      setNewFlowDesc('')
    } catch (err) {
      console.warn('Create flow failed', err)
    } finally {
      setCreating(false)
    }
  }

  async function handleAddStep(flowId: string, e: React.FormEvent) {
    e.preventDefault()
    if (!stepLabel.trim()) return
    setAddingStep(true)
    try {
      const res = await fetch(`/api/approvals/flows/${flowId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: stepLabel.trim() })
      })
      if (!res.ok) throw new Error('Failed to add step')
      // Reload steps
      const stepsRes = await fetch(`/api/approvals/flows/${flowId}/steps`, { headers: { Authorization: `Bearer ${token}` } })
      if (stepsRes.ok) {
        const steps = await stepsRes.json()
        setStepsMap(prev => ({ ...prev, [flowId]: steps }))
      }
      setStepLabel('')
      setShowAddStep(null)
    } catch (err) {
      console.warn('Add step failed', err)
    } finally {
      setAddingStep(false)
    }
  }

  async function handleDeleteStep(flowId: string, stepId: string) {
    try {
      const res = await fetch(`/api/approvals/flows/${flowId}/steps/${stepId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete step')
      setStepsMap(prev => ({ ...prev, [flowId]: prev[flowId].filter(s => s.id !== stepId) }))
    } catch (err) {
      console.warn('Delete step failed', err)
    }
  }

  async function handleToggleActive(flow: Flow) {
    try {
      const res = await fetch(`/api/approvals/flows/${flow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !flow.is_active })
      })
      if (!res.ok) throw new Error('Failed to toggle flow')
      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, is_active: !f.is_active } : f))
    } catch (err) {
      console.warn('Toggle active failed', err)
    }
  }

  async function handleDeleteFlow() {
    if (!deleteFlowId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/approvals/flows/${deleteFlowId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete flow')
      setFlows(prev => prev.filter(f => f.id !== deleteFlowId))
      setDeleteFlowId(null)
    } catch (err) {
      console.warn('Delete flow failed', err)
    } finally {
      setDeleting(false)
    }
  }

  async function handleApprove(approvalId: string) {
    setActionLoading(approvalId)
    try {
      const res = await fetch(`/api/approvals/${approvalId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: '' })
      })
      if (!res.ok) throw new Error('Approval failed')
      setPending(prev => prev.filter(p => p.id !== approvalId))
    } catch (err) {
      console.warn('Approve failed', err)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(approvalId: string) {
    const comment = prompt('Reason for rejection:')
    if (!comment) return
    setActionLoading(approvalId)
    try {
      const res = await fetch(`/api/approvals/${approvalId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment })
      })
      if (!res.ok) throw new Error('Rejection failed')
      setPending(prev => prev.filter(p => p.id !== approvalId))
    } catch (err) {
      console.warn('Reject failed', err)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Approvals</h1>

      {/* Pending Approvals */}
      <section>
        <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-200 mb-3">Pending Your Review</h2>
        {pending.length === 0 ? (
          <div className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 p-8 text-center">
            <p className="text-sm text-stone-400 dark:text-stone-500">No pending approvals.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map(p => (
              <div key={p.id} className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{p.title}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {p.tracking_number} &middot; Step {p.step_order}: {p.label} &middot; by {p.creator_name} &middot; {formatDateTime(p.created_at)}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => navigate(`/documents/${p.document_id}`)} className="min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">View</button>
                  <button onClick={() => handleApprove(p.id)} disabled={actionLoading === p.id} className="min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                  <button onClick={() => handleReject(p.id)} disabled={actionLoading === p.id} className="min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Admin: Workflow Management */}
      {isAdmin && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-200">Approval Flows</h2>
            <button onClick={() => setShowCreateFlow(true)} className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 text-white hover:bg-amber-600">+ New Flow</button>
          </div>

          {showCreateFlow && (
            <form onSubmit={handleCreateFlow} className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 mb-3 space-y-3">
              <input value={newFlowName} onChange={e => setNewFlowName(e.target.value)} placeholder="Flow name" required className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <textarea value={newFlowDesc} onChange={e => setNewFlowDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <div className="flex gap-2">
                <button type="submit" disabled={creating} className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
                <button type="button" onClick={() => setShowCreateFlow(false)} className="px-4 py-2 text-xs font-medium rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">Cancel</button>
              </div>
            </form>
          )}

          {flowsLoading ? (
            <div className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 p-8 text-center">
              <p className="text-sm text-stone-400">Loading...</p>
            </div>
          ) : flows.length === 0 ? (
            <div className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 p-8 text-center">
              <p className="text-sm text-stone-400 dark:text-stone-500">No approval flows defined.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flows.map(f => (
                <div key={f.id} className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{f.name}</p>
                      {f.description && <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{f.description}</p>}
                      <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">by {f.created_by_name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400'}`}>{f.is_active ? 'Active' : 'Inactive'}</span>
                      <button onClick={() => loadSteps(f.id)} className="min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">{expandedFlow === f.id ? 'Collapse' : 'Steps'}</button>
                      <button onClick={() => handleToggleActive(f)} className="min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">{f.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button onClick={() => setDeleteFlowId(f.id)} className="min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-xl border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
                    </div>
                  </div>
                  {expandedFlow === f.id && (
                    <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-700 pt-3">
                      {stepsMap[f.id]?.length > 0 ? (
                        <ul className="space-y-1 mb-3">
                          {stepsMap[f.id].map(s => (
                            <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-xl bg-stone-50 dark:bg-stone-800/60">
                              <span className="text-xs text-stone-700 dark:text-stone-300">
                                <span className="font-mono font-medium text-stone-400">#{s.step_order}</span> {s.label}
                              </span>
                              <button onClick={() => handleDeleteStep(f.id, s.id)} className="text-xs text-red-500 hover:text-red-600 hover:underline">Remove</button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-stone-400 mb-3">No steps yet.</p>
                      )}
                      {showAddStep === f.id ? (
                        <form onSubmit={e => handleAddStep(f.id, e)} className="flex gap-2">
                          <input value={stepLabel} onChange={e => setStepLabel(e.target.value)} placeholder="Step label" required className="flex-1 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          <button type="submit" disabled={addingStep} className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">Add</button>
                          <button type="button" onClick={() => setShowAddStep(null)} className="px-3 py-1.5 text-xs font-medium rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300">Cancel</button>
                        </form>
                      ) : (
                        <button onClick={() => setShowAddStep(f.id)} className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:underline">+ Add Step</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Delete flow confirmation */}
      {deleteFlowId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteFlowId(null)} aria-hidden="true" />
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-2xl p-6 animate-slide-up">
            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">Delete approval flow?</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
              This action cannot be undone. Any documents using this flow will lose their approval assignments.
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => setDeleteFlowId(null)} className="flex-1 min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-600 focus:outline-none focus:ring-2 focus:ring-stone-300 transition-all">Cancel</button>
              <button onClick={handleDeleteFlow} disabled={deleting} className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-stone-800 transition-all shadow-sm disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
