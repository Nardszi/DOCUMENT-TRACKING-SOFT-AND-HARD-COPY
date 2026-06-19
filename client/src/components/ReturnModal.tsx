import { useState } from 'react'
import { useFocusTrap } from '../utils/useFocusTrap'

interface UpdatedDoc {
  id: number; status: string
  current_department: { id: number; code: string; name: string }
}

interface ReturnModalProps {
  documentId: string
  token: string
  returnToDept: { id: number; code: string; name: string } | null
  onSuccess: (updatedDoc: UpdatedDoc) => void
  onClose: () => void
}

export default function ReturnModal({ documentId, token, returnToDept, onSuccess, onClose }: ReturnModalProps) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validate() {
    if (!reason.trim()) { setReasonError('Reason is required.'); return false }
    setReasonError('')
    return true
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    setApiError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message || 'Failed to return document.')
      }
      onSuccess(await res.json())
      onClose()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to return.')
    } finally {
      setSubmitting(false)
    }
  }

  const trapRef = useFocusTrap(true)
  return (
    <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="ret-title"
      className="fixed inset-0 z-40 flex items-start sm:items-center justify-center bg-black/50 px-4 pt-8 pb-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-stone-800 dark:border dark:border-stone-700 max-h-[calc(100vh-4rem)] overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <h2 id="ret-title" className="text-base font-bold text-stone-900 dark:text-stone-100">Return Document</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Send back to the previous department for corrections</p>
        </div>

        <div className="p-5 space-y-4">
          {apiError && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400">{apiError}</div>
          )}

          {/* Destination info */}
          <div className="rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-4 py-3">
            <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Returning to</p>
            {returnToDept ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{returnToDept.code} — {returnToDept.name}</p>
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">The department that last forwarded this document to you</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-500 dark:text-stone-400">Previous department</p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label htmlFor="ret-reason" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
              Reason for Return <span className="text-red-500">*</span>
            </label>
            <textarea id="ret-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="What needs to be corrected?&#10;e.g. Missing signature on page 2, budget figures need revision."
              className={`w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y transition-all ${reasonError ? 'border-red-400' : 'border-stone-200 dark:border-stone-600'}`} />
            {reasonError && <p className="mt-1 text-xs text-red-600">{reasonError}</p>}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-stone-700">
            <button onClick={onClose} disabled={submitting}
              className="px-4 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="px-5 py-2 rounded-lg bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 shadow-sm transition-colors">
              {submitting ? 'Returning…' : 'Return Document'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
