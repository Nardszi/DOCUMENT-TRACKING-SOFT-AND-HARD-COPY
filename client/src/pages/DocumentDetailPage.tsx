import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from '../components/StatusBadge'
import PriorityBadge from '../components/PriorityBadge'
import DeadlineBadge from '../components/DeadlineBadge'
import AttachmentUpload from '../components/AttachmentUpload'
import RoutingModal from '../components/RoutingModal'
import ReturnModal from '../components/ReturnModal'
import ActionModal from '../components/ActionModal'
import ConfirmDialog from '../components/ConfirmDialog'
import TrackingLogTimeline from '../components/TrackingLogTimeline'
import CommentsSection from '../components/CommentsSection'

interface Department { id: number; code: string; name: string }
interface User { id: number; full_name: string }
interface Attachment {
  id: number; original_name: string; filename: string
  mime_type: string; file_size_bytes: number; uploaded_by: User; uploaded_at: string
}
interface TrackingEntry {
  id: number; event_type: string; remarks: string | null
  metadata: Record<string, unknown> | null; created_at: string; user: User; department: Department
}
interface DocumentDetail {
  id: number; tracking_number: string; title: string
  category: { id: number; name: string }
  originating_department: Department; current_department: Department
  description: string | null; status: string; priority: string
  deadline: string | null; is_overdue: boolean; created_by: User
  created_at: string; updated_at: string
  attachments: Attachment[]; tracking_log: TrackingEntry[]
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-base text-stone-900 dark:text-stone-100">{children}</dd>
    </div>
  )
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token, user } = useAuth()
  const navigate = useNavigate()

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [showActionModal, setShowActionModal] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showRecallConfirm, setShowRecallConfirm] = useState(false)
  const [recallReason, setRecallReason] = useState('')
  const [recalling, setRecalling] = useState(false)

  function refetchDoc() {
    if (!id) return
    fetch(`/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => setDoc(data)).catch(() => {})
  }

  function handleRoutingSuccess(_updatedDoc: { id: number; status: string; current_department: { id: number; code: string; name: string } }) {
    refetchDoc()
  }

  async function handleMarkComplete() {
    setCompleting(true)
    try {
      const res = await fetch(`/api/documents/${id}/complete`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      setDoc(prev => prev ? { ...prev, status: 'completed' } : prev)
      refetchDoc()
    } catch {} finally { setCompleting(false); setShowCompleteConfirm(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      navigate('/documents')
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  async function handleRecall() {
    if (!recallReason.trim()) return
    setRecalling(true)
    try {
      const res = await fetch(`/api/documents/${id}/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: recallReason.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || 'Failed to recall document.')
      }
      setShowRecallConfirm(false)
      setRecallReason('')
      refetchDoc()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to recall document.')
    } finally {
      setRecalling(false)
    }
  }  useEffect(() => {
    if (!id) return
    setLoading(true); setError('')
    fetch(`/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => setDoc(data))
      .catch(() => setError('Failed to load document.'))
      .finally(() => setLoading(false))
  }, [id, token])

  if (loading) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center">
      <div className="flex items-center gap-3 text-stone-500 dark:text-stone-400">
        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  )

  if (error || !doc) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-2xl mx-auto">
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400 mb-4">
          {error || 'Document not found.'}
        </div>
        <button onClick={() => navigate('/documents')}
          className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">
          ← Back to Documents
        </button>
      </div>
    </div>
  )

  const isCompleted = doc.status === 'completed'
  const canMarkComplete = user?.role === 'department_head' || user?.role === 'admin'
  const canDelete = user?.role === 'admin'
  // Can recall if: originating dept user (or admin), doc is not completed, and doc is not already in originating dept
  const canRecall = !isCompleted
    && doc.current_department.id !== doc.originating_department.id
    && (user?.role === 'admin' || user?.departmentId === String(doc.originating_department.id))

  return (
    <>
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/documents')}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors">
              ← Back
            </button>
            <div>
              <p className="text-xs font-mono text-stone-400">{doc.tracking_number}</p>
              <h1 className="text-xl font-bold text-white tracking-tight leading-tight">{doc.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={isCompleted ? '#' : `/documents/${doc.id}/edit`}
              onClick={e => isCompleted && e.preventDefault()}
              className={`inline-flex items-center min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors ${isCompleted ? 'opacity-50 pointer-events-none' : ''}`}>
              Edit
            </Link>
            <a href={`/api/documents/${doc.id}/qr-cover`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors">
              Print Cover Sheet
            </a>
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
                className="inline-flex items-center min-h-[40px] px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-5">
        {/* Completed banner */}
        {isCompleted && (
          <div role="status" className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-semibold">COMPLETED — This document has been fully processed.</span>
          </div>
        )}

        {/* Action bar */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-4 mb-4 flex flex-wrap gap-2 items-center dark:bg-stone-800/80 dark:border-stone-700">
          <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mr-1">Actions:</span>
          <button disabled={isCompleted} onClick={() => setShowForwardModal(true)}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-purple-600 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Forward
          </button>
          <button disabled={isCompleted} onClick={() => setShowReturnModal(true)}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Return
          </button>
          <button disabled={isCompleted} onClick={() => setShowActionModal(true)}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Record Action
          </button>
          {canMarkComplete && (
            <button disabled={isCompleted || completing} onClick={() => setShowCompleteConfirm(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {completing ? 'Completing…' : 'Mark Complete'}
            </button>
          )}
          {canRecall && (
            <button onClick={() => setShowRecallConfirm(true)} disabled={recalling}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Recall
            </button>
          )}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: doc info + attachments */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Document info card */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
              <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2 dark:bg-stone-800 dark:border-stone-700">
                <span className="text-xs font-mono text-stone-500">{doc.tracking_number}</span>
                <StatusBadge status={doc.status} />
                {doc.is_overdue && <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">OVERDUE</span>}
              </div>
              <div className="p-5">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <InfoField label="Category">{doc.category.name}</InfoField>
                  <InfoField label="Priority"><PriorityBadge priority={doc.priority} /></InfoField>
                  <InfoField label="Deadline"><DeadlineBadge deadline={doc.deadline} isOverdue={doc.is_overdue} /></InfoField>
                  <InfoField label="Originating Department">
                    <span className="font-medium">{doc.originating_department.code}</span> — {doc.originating_department.name}
                  </InfoField>
                  <InfoField label="Current Department">
                    <span className="font-medium">{doc.current_department.code}</span> — {doc.current_department.name}
                  </InfoField>
                  <InfoField label="Created By">{doc.created_by.full_name}</InfoField>
                  <InfoField label="Created At">{formatDate(doc.created_at)}</InfoField>
                </dl>
                {doc.description && (
                  <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-700">
                    <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-1">Description</p>
                    <p className="text-sm text-stone-800 dark:text-stone-200 whitespace-pre-wrap">{doc.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
              <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Attachments</h2>
                <span className="text-xs font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full dark:bg-stone-700 dark:text-stone-300">{doc.attachments.length}</span>
              </div>
              <div className="p-5">
                {doc.attachments.length > 0 && (
                  <ul className="divide-y divide-stone-100 dark:divide-stone-700/60 mb-4">
                    {doc.attachments.map(att => (
                      <li key={att.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{att.original_name}</p>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{formatBytes(att.file_size_bytes)} · {att.uploaded_by.full_name} · {formatDateTime(att.uploaded_at)}</p>
                        </div>
                        <a href={`/api/documents/${doc.id}/attachments/${att.id}`} download={att.original_name}
                          className="flex-shrink-0 min-h-[36px] px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <AttachmentUpload documentId={String(doc.id)} token={token ?? ''} disabled={isCompleted}
                  onUploaded={att => setDoc(prev => prev ? { ...prev, attachments: [...prev.attachments, att] } : prev)} />
              </div>
            </div>
          </div>

          {/* Right: tracking log */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden dark:bg-stone-800/80 dark:border-stone-700">
              <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Tracking Log</h2>
                <span className="text-xs font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full dark:bg-stone-700 dark:text-stone-300">{doc.tracking_log.length}</span>
              </div>
              <div className="p-5">
                <TrackingLogTimeline entries={doc.tracking_log} />
              </div>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-5 mt-4 dark:bg-stone-800/80 dark:border-stone-700">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">Comments</h2>
          <CommentsSection documentId={String(doc.id)} />
        </div>
      </div>
    </div>

    {showForwardModal && id && <RoutingModal documentId={id} token={token ?? ''} onSuccess={handleRoutingSuccess} onClose={() => setShowForwardModal(false)} />}
    {showReturnModal && id && <ReturnModal documentId={id} token={token ?? ''} onSuccess={handleRoutingSuccess} onClose={() => setShowReturnModal(false)} />}
    {showActionModal && id && <ActionModal documentId={id} token={token ?? ''} onSuccess={refetchDoc} onClose={() => setShowActionModal(false)} />}
    {showCompleteConfirm && (
      <ConfirmDialog title="Mark Document Complete"
        message="Are you sure you want to mark this document as completed? This action cannot be undone."
        confirmLabel="Mark Complete" onConfirm={handleMarkComplete} onCancel={() => setShowCompleteConfirm(false)} />
    )}
    {showDeleteConfirm && (
      <ConfirmDialog title="Delete Document"
        message={`Permanently delete "${doc.title}"? This will remove all attachments, comments, and tracking history. This cannot be undone.`}
        confirmLabel="Delete Document" onConfirm={handleDelete} onCancel={() => setShowDeleteConfirm(false)} danger />
    )}

    {/* ── Recall modal ── */}
    {showRecallConfirm && (
      <div role="dialog" aria-modal="true" aria-labelledby="recall-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          onClick={() => { setShowRecallConfirm(false); setRecallReason('') }} aria-hidden="true" />
        <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700 shadow-2xl overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="bg-violet-600 px-6 py-4">
            <h2 id="recall-modal-title" className="text-base font-bold text-white">Recall Document</h2>
            <p className="text-xs text-violet-200 mt-0.5">Pull this document back to your department</p>
          </div>
          {/* Guidance */}
          <div className="mx-6 mt-5 flex gap-3 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 dark:bg-violet-900/20 dark:border-violet-800/40">
            <svg className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs text-violet-800 dark:text-violet-300 space-y-1">
              <p><strong>When to Recall:</strong> Use this when you sent the document by mistake, or need to make corrections before it proceeds.</p>
              <p>The document will be returned to your department and the receiving department will be notified.</p>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label htmlFor="recall-reason" className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 dark:text-stone-400">
                Reason for Recall <span className="text-red-500">*</span>
              </label>
              <textarea
                id="recall-reason"
                rows={3}
                value={recallReason}
                onChange={e => setRecallReason(e.target.value)}
                placeholder="e.g. Sent to wrong department. Please disregard."
                className="w-full rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 transition-all"
              />
            </div>
            <div className="flex gap-2.5 pt-1 border-t border-stone-100 dark:border-stone-700">
              <button type="button"
                onClick={() => { setShowRecallConfirm(false); setRecallReason('') }}
                className="flex-1 min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600 transition-all">
                Cancel
              </button>
              <button type="button"
                onClick={handleRecall}
                disabled={recalling || !recallReason.trim()}
                className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
                {recalling ? 'Recalling…' : 'Recall Document'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
