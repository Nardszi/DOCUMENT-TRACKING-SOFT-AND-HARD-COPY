import { useState, useEffect } from 'react'
import ConfirmDialog from './ConfirmDialog'

interface Department {
  id: number
  code: string
  name: string
}

interface UpdatedDoc {
  id: number
  status: string
  current_department: { id: number; code: string; name: string }
}

interface RoutingModalProps {
  documentId: string
  token: string
  onSuccess: (updatedDoc: UpdatedDoc) => void
  onClose: () => void
}

export default function RoutingModal({ documentId, token, onSuccess, onClose }: RoutingModalProps) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [toDeptId, setToDeptId] = useState('')
  const [routingNote, setRoutingNote] = useState('')
  const [ccDeptIds, setCcDeptIds] = useState<number[]>([])
  const [toDeptError, setToDeptError] = useState('')
  const [noteError, setNoteError] = useState('')
  const [apiError, setApiError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/departments', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch(() => setApiError('Failed to load departments.'))
  }, [token])

  function validateToDept() {
    if (!toDeptId) {
      setToDeptError('Please select a department.')
      return false
    }
    setToDeptError('')
    return true
  }

  function validateNote() {
    if (!routingNote.trim()) {
      setNoteError('Routing note is required.')
      return false
    }
    setNoteError('')
    return true
  }

  function handleSubmitClick() {
    const v1 = validateToDept()
    const v2 = validateNote()
    if (!v1 || !v2) return
    setShowConfirm(true)
  }

  async function handleConfirm() {
    setShowConfirm(false)
    setSubmitting(true)
    setApiError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/forward`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to_department_id: toDeptId,
          routing_note: routingNote.trim(),
          cc_department_ids: ccDeptIds.length > 0 ? ccDeptIds.map(String) : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.message || 'Failed to forward document.')
      }
      const data = await res.json()
      onSuccess(data)
      onClose()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to forward document.')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleCc(deptId: number) {
    setCcDeptIds((prev) =>
      prev.includes(deptId) ? prev.filter((d) => d !== deptId) : [...prev, deptId]
    )
  }

  const ccDepts = departments.filter((d) => String(d.id) !== toDeptId)
  const selectedDept = departments.find((d) => String(d.id) === toDeptId)

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="routing-modal-title"
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"
      >
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden dark:bg-stone-800 dark:border dark:border-stone-700">
          {/* Header */}
          <div className="bg-violet-600 px-6 py-4">
            <h2 id="routing-modal-title" className="text-base font-bold text-white">
              Forward Document
            </h2>
            <p className="text-xs text-violet-200 mt-0.5">Transfer this document to another department for action</p>
          </div>

          {/* Guidance note */}
          <div className="mx-6 mt-5 flex gap-3 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 dark:bg-violet-900/20 dark:border-violet-800/40">
            <svg className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs text-violet-800 dark:text-violet-300 space-y-1">
              <p><strong>When to Forward:</strong> Use this when the document needs review, approval, or action by another department.</p>
              <p><strong>Routing Note:</strong> Clearly state what the receiving department needs to do — e.g. "Please review and sign" or "For approval of the General Manager".</p>
              <p><strong>CC Departments:</strong> Add departments that should be kept informed but don't need to act.</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
          {apiError && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300">
              {apiError}
            </div>
          )}

          {/* Forward To */}
          <div>
            <label htmlFor="forward-to" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
              Forward To <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <select
              id="forward-to"
              value={toDeptId}
              onChange={(e) => { setToDeptId(e.target.value); setCcDeptIds([]) }}
              onBlur={validateToDept}
              className={`w-full min-h-[44px] rounded-xl border px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 dark:bg-stone-700 dark:text-stone-100 dark:border-stone-600 transition-all ${
                toDeptError ? 'border-red-400' : 'border-stone-200'
              }`}
            >
              <option value="">— Select destination department —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
            {toDeptError && <p className="mt-1.5 text-xs text-red-600">{toDeptError}</p>}
          </div>

          {/* Routing Note */}
          <div>
            <label htmlFor="routing-note" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
              Routing Note <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <textarea
              id="routing-note"
              rows={3}
              value={routingNote}
              onChange={(e) => setRoutingNote(e.target.value)}
              onBlur={validateNote}
              placeholder="e.g. Please review and provide your approval. Return with comments if revisions are needed."
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 resize-y dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-400 dark:border-stone-600 transition-all ${
                noteError ? 'border-red-400' : 'border-stone-200'
              }`}
            />
            {noteError && <p className="mt-1.5 text-xs text-red-600">{noteError}</p>}
          </div>

          {/* CC Departments */}
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 dark:text-stone-400">
              CC Departments <span className="normal-case font-normal text-stone-400">(optional — for awareness only)</span>
            </p>
            {ccDepts.length === 0 ? (
              <p className="text-sm text-stone-400 dark:text-stone-500 italic">
                {toDeptId ? 'No other departments available.' : 'Select a destination department first.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ccDepts.map((d) => (
                  <label key={d.id} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-3 py-2 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={ccDeptIds.includes(d.id)}
                      onChange={() => toggleCc(d.id)}
                      className="w-4 h-4 rounded border-stone-300 text-violet-600 focus:ring-violet-400 dark:border-stone-600"
                    />
                    <span className="text-sm text-stone-700 dark:text-stone-200">{d.code} — {d.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-stone-100 dark:border-stone-700">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitClick}
              disabled={submitting}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 shadow-sm transition-all"
            >
              {submitting ? 'Forwarding…' : 'Forward Document'}
            </button>
          </div>
          </div>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Forward"
          message={`Forward this document to ${selectedDept ? `${selectedDept.code} — ${selectedDept.name}` : 'the selected department'}?`}
          confirmLabel="Forward"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
