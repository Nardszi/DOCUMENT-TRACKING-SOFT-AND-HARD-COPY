import { useState, useEffect } from 'react'
import { useFocusTrap } from '../utils/useFocusTrap'

interface Department { id: number; code: string; name: string }

interface UpdatedDoc {
  id: number; status: string
  current_department: { id: number; code: string; name: string }
}

interface RoutingModalProps {
  documentId: string
  token: string
  currentDepartmentId: number
  onSuccess: (updatedDoc: UpdatedDoc) => void
  onClose: () => void
}

export default function RoutingModal({ documentId, token, currentDepartmentId, onSuccess, onClose }: RoutingModalProps) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [toDeptId, setToDeptId] = useState('')
  const [routingNote, setRoutingNote] = useState('')
  const [ccDeptIds, setCcDeptIds] = useState<number[]>([])
  const [forwardToAll, setForwardToAll] = useState(false)
  const [toDeptError, setToDeptError] = useState('')
  const [noteError, setNoteError] = useState('')
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => setApiError('Failed to load departments.'))
  }, [token])

  const otherDepts = departments.filter(d => d.id !== currentDepartmentId)
  const ccDepts = otherDepts.filter(d => String(d.id) !== toDeptId)

  function validate() {
    let ok = true
    if (!forwardToAll && !toDeptId) { setToDeptError('Select a department.'); ok = false } else { setToDeptError('') }
    if (!routingNote.trim()) { setNoteError('Routing note is required.'); ok = false } else { setNoteError('') }
    return ok
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      const endpoint = forwardToAll ? 'forward-all' : 'forward'
      const body: Record<string, unknown> = { routing_note: routingNote.trim() }
      if (!forwardToAll) {
        body.to_department_id = toDeptId
        if (ccDeptIds.length > 0) body.cc_department_ids = ccDeptIds.map(String)
      }
      const res = await fetch(`/api/documents/${documentId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Failed to forward document.')
      }
      onSuccess(await res.json())
      onClose()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to forward.')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleCc(id: number) {
    setCcDeptIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
  }

  const trapRef = useFocusTrap(true)
  return (
    <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="fwd-title"
      className="fixed inset-0 z-40 flex items-start sm:items-center justify-center bg-black/50 px-4 pt-8 pb-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-stone-800 dark:border dark:border-stone-700 max-h-[calc(100vh-4rem)] overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <h2 id="fwd-title" className="text-base font-bold text-stone-900 dark:text-stone-100">Forward Document</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Send this document to another department for action</p>
        </div>

        <div className="p-5 space-y-4">
          {apiError && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">{apiError}</div>
          )}

          {/* Forward mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setForwardToAll(false); setToDeptId('') }}
              className={`rounded-lg border-2 px-3 py-2.5 text-left transition-all ${!forwardToAll ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-400' : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'}`}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
                <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">One Department</span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 ml-6">Forward to a specific department</p>
            </button>
            <button type="button" onClick={() => { setForwardToAll(true); setToDeptId(''); setCcDeptIds([]) }}
              className={`rounded-lg border-2 px-3 py-2.5 text-left transition-all ${forwardToAll ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-400' : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600'}`}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">All Departments</span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 ml-6">Broadcast to every department</p>
            </button>
          </div>

          {/* Forward-to-all notice */}
          {forwardToAll && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              <p className="font-semibold mb-0.5">How Forward-to-All works:</p>
              <p>Every department receives a notification and can view the document. The document stays in your department — you remain responsible for it until it's completed or returned.</p>
            </div>
          )}

          {/* Destination department */}
          {!forwardToAll && (
            <div>
              <label htmlFor="fwd-to" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
                Destination <span className="text-red-500">*</span>
              </label>
              <select id="fwd-to" value={toDeptId} onChange={e => { setToDeptId(e.target.value); setCcDeptIds([]) }}
                className={`w-full min-h-[40px] rounded-lg border px-3 py-2 text-sm bg-white dark:bg-stone-700 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all ${toDeptError ? 'border-red-400' : 'border-stone-200 dark:border-stone-600'}`}>
                <option value="">Select department…</option>
                {otherDepts.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
              </select>
              {toDeptError && <p className="mt-1 text-xs text-red-600">{toDeptError}</p>}
            </div>
          )}

          {/* Routing note */}
          <div>
            <label htmlFor="fwd-note" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
              Routing Note <span className="text-red-500">*</span>
            </label>
            <textarea id="fwd-note" rows={3} value={routingNote} onChange={e => setRoutingNote(e.target.value)}
              placeholder="What should the receiving department do?&#10;e.g. Please review and approve the attached budget."
              className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-y transition-all ${noteError ? 'border-red-400' : 'border-stone-200 dark:border-stone-600'}`} />
            {noteError && <p className="mt-1 text-xs text-red-600">{noteError}</p>}
          </div>

          {/* CC departments */}
          {!forwardToAll && (
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
                CC <span className="normal-case font-normal text-stone-400">(optional — for awareness)</span>
              </p>
              {ccDepts.length === 0 ? (
                <p className="text-xs text-stone-400 dark:text-stone-500">{toDeptId ? 'No other departments.' : 'Select destination first.'}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {ccDepts.map(d => (
                    <label key={d.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors cursor-pointer">
                      <input type="checkbox" checked={ccDeptIds.includes(d.id)} onChange={() => toggleCc(d.id)}
                        className="w-3.5 h-3.5 rounded border-stone-300 text-violet-600 focus:ring-violet-400 dark:border-stone-600" />
                      <span className="text-xs text-stone-700 dark:text-stone-300">{d.code} — {d.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-700">
            <button onClick={onClose} disabled={submitting}
              className="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="px-5 py-2 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 shadow-sm transition-colors">
              {submitting ? 'Forwarding…' : forwardToAll ? 'Forward to All' : 'Forward'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
