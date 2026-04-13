import { useState } from 'react'

const ACTION_TYPES = ['Received', 'Reviewed', 'Approved', 'Returned'] as const
type ActionType = (typeof ACTION_TYPES)[number]

interface ActionModalProps {
  documentId: string
  token: string
  onSuccess: () => void
  onClose: () => void
}

export default function ActionModal({ documentId, token, onSuccess, onClose }: ActionModalProps) {
  const [actionType, setActionType] = useState<ActionType | ''>('')
  const [remarks, setRemarks] = useState('')
  const [actionTypeError, setActionTypeError] = useState('')
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function validateActionType() {
    if (!actionType) {
      setActionTypeError('Action type is required.')
      return false
    }
    setActionTypeError('')
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateActionType()) return

    setSubmitting(true)
    setApiError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action_type: actionType,
          ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to record action.')
      }
      onSuccess()
      onClose()
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to record action.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden dark:bg-stone-800 dark:border dark:border-stone-700">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-4">
          <h2 id="action-modal-title" className="text-base font-bold text-white">
            Record Action
          </h2>
          <p className="text-xs text-blue-200 mt-0.5">Log what was done with this document at your department</p>
        </div>

        {/* Guidance note */}
        <div className="mx-6 mt-5 flex gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 dark:bg-blue-900/20 dark:border-blue-800/40">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
            <p><strong>Received</strong> — Acknowledge that your department has received the document.</p>
            <p><strong>Reviewed</strong> — Record that the document has been reviewed and evaluated.</p>
            <p><strong>Approved</strong> — Confirm that the document has been approved at your level.</p>
            <p><strong>Returned</strong> — Note that the document was sent back (use the Return button for the actual routing).</p>
            <p className="text-blue-600 dark:text-blue-400">Add remarks to provide context or instructions for the next handler.</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
        {apiError && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300"
          >
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="action-type" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
              Action Type <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <select
              id="action-type"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as ActionType | '')}
              onBlur={validateActionType}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 dark:bg-stone-700 dark:text-stone-100 dark:border-stone-600 transition-all ${
                actionTypeError ? 'border-red-400' : 'border-stone-200'
              }`}
            >
              <option value="">Select action type…</option>
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {actionTypeError && <p className="mt-1.5 text-xs text-red-600">{actionTypeError}</p>}
          </div>

          <div>
            <label htmlFor="action-remarks" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
              Remarks <span className="normal-case font-normal text-stone-400">(optional)</span>
            </label>
            <textarea
              id="action-remarks"
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Reviewed and approved. Please proceed to the next step."
              className="w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 resize-y dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 dark:placeholder-stone-400 transition-all"
            />
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
              type="submit"
              disabled={submitting}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 shadow-sm transition-all"
            >
              {submitting ? 'Recording…' : 'Record Action'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}
