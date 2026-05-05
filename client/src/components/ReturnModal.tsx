import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

interface UpdatedDoc {
  id: number
  status: string
  current_department: { id: number; code: string; name: string }
}

interface ReturnModalProps {
  documentId: string
  token: string
  onSuccess: (updatedDoc: UpdatedDoc) => void
  onClose: () => void
}

export default function ReturnModal({ documentId, token, onSuccess, onClose }: ReturnModalProps) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [apiError, setApiError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function validateReason() {
    if (!reason.trim()) {
      setReasonError('Reason for return is required.')
      return false
    }
    setReasonError('')
    return true
  }

  function handleSubmitClick() {
    if (!validateReason()) return
    setShowConfirm(true)
  }

  async function handleConfirm() {
    setShowConfirm(false)
    setSubmitting(true)
    setApiError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.message || 'Failed to return document.')
      }
      const data = await res.json()
      onSuccess(data)
      onClose()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to return document.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-modal-title"
        className="fixed inset-0 z-40 flex items-start sm:items-center justify-center bg-black/50 px-4 pt-8 pb-4 overflow-y-auto"
      >
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden dark:bg-stone-800 dark:border dark:border-stone-700 max-h-[calc(100vh-4rem)] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Header */}
          <div className="bg-amber-500 px-6 py-4">
            <h2 id="return-modal-title" className="text-base font-bold text-white">
              Return Document
            </h2>
            <p className="text-xs text-amber-100 mt-0.5">Send this document back to the previous department</p>
          </div>

          {/* Guidance note */}
          <div className="mx-6 mt-5 flex gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 dark:bg-amber-900/20 dark:border-amber-800/40">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p><strong>When to Return:</strong> Use this when the document is incomplete, has errors, or requires corrections before it can proceed.</p>
              <p><strong>Reason:</strong> Be specific — state exactly what needs to be corrected or completed, e.g. "Missing signature on page 2" or "Budget figures need revision".</p>
              <p>The document will be sent back to the department that last forwarded it to you.</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
          {apiError && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300">
              {apiError}
            </div>
          )}

          <div>
            <label htmlFor="return-reason" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
              Reason for Return <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <textarea
              id="return-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={validateReason}
              placeholder="e.g. The attached budget breakdown is incomplete. Please revise and resubmit with the updated figures."
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-y dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-400 dark:border-stone-600 transition-all ${
                reasonError ? 'border-red-400' : 'border-stone-200'
              }`}
            />
            {reasonError && <p className="mt-1.5 text-xs text-red-600">{reasonError}</p>}
          </div>

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
              className="min-h-[40px] px-5 py-2 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 shadow-sm transition-all"
            >
              {submitting ? 'Returning…' : 'Return Document'}
            </button>
          </div>
          </div>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Return"
          message="Are you sure you want to return this document?"
          confirmLabel="Return"
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          danger
        />
      )}
    </>
  )
}
