import { useState, useEffect, useRef, useCallback } from 'react'
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
import Skeleton from '../components/Skeleton'
import { useToast } from '../components/ToastContainer'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatBytes, formatDateTime, formatDate } from '../utils/format'

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
  deadline: string | null; is_overdue: boolean; is_archived: boolean; created_by: User
  created_at: string; updated_at: string
  attachments: Attachment[]; tracking_log: TrackingEntry[]
}

function PreviewModal({ attachment, docId, onClose }: {
  attachment: Attachment; docId: string; onClose: () => void
}) {
  const { token } = useAuth()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [loading, setLoading] = useState(true)
  const objectUrlRef = useRef<string | null>(null)
  const isImage = attachment.mime_type.startsWith('image/')
  const isPdf = attachment.mime_type === 'application/pdf'

  useEffect(() => {
    const t = token ?? localStorage.getItem('noneco_token')
    if (!t || !isImage && !isPdf) { setLoading(false); return }
    setLoading(true); setPreviewError(false)
    const url = `/api/documents/${docId}/attachments/${attachment.id}?preview=1`
    fetch(url, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
      .then(blob => {
        const url = URL.createObjectURL(blob)
        objectUrlRef.current = url
        setObjectUrl(url)
      })
      .catch(() => setPreviewError(true))
      .finally(() => setLoading(false))
    return () => {
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null }
    }
  }, [token, docId, attachment.id, isImage, isPdf])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800">
          <h2 id="preview-title" className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{attachment.original_name}</h2>
          <button onClick={onClose} aria-label="Close preview"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl hover:bg-stone-200 dark:hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors text-stone-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-stone-100 dark:bg-stone-950 flex items-center justify-center p-4" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-stone-400">
              <svg className="w-8 h-8 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm">Loading preview…</span>
            </div>
          ) : previewError ? (
            <div className="text-center text-stone-500 dark:text-stone-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-red-300 dark:text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm font-medium">Failed to load preview.</p>
              <p className="text-xs mt-1">Please download the file instead.</p>
            </div>
          ) : isImage && objectUrl ? (
            <img src={objectUrl} alt={attachment.original_name} className="max-w-full max-h-full object-contain rounded-lg" />
          ) : isPdf && objectUrl ? (
            <iframe src={objectUrl} title={attachment.original_name} className="w-full h-full rounded-lg min-h-[300px] sm:min-h-[60vh]" />
          ) : (
            <div className="text-center text-stone-500 dark:text-stone-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-stone-300 dark:text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">Preview not available for this file type.</p>
              <p className="text-xs mt-1">Please download the file instead.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
  useDocumentTitle('Document Detail')
  const { id } = useParams<{ id: string }>()
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()

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
  const [recallError, setRecallError] = useState('')
  const [recalling, setRecalling] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [versions, setVersions] = useState<{ id: string; version: number; snapshot: Record<string, unknown>; changed_by: { id: string; full_name: string }; changed_at: string }[]>([])
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)
  const [approvals, setApprovals] = useState<{ id: string; step_order: number; label: string; status: string; assigned_to: string | null; assigned_department_id: string | null; comment: string | null; decided_by_name: string | null; decided_at: string | null; department_code: string | null }[]>([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [flows, setFlows] = useState<{ id: string; name: string }[]>([])
  const [showAssignFlow, setShowAssignFlow] = useState(false)
  const [selectedFlowId, setSelectedFlowId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [deleteAttId, setDeleteAttId] = useState<string | null>(null)
  const [deleteAttName, setDeleteAttName] = useState('')

  function refetchDoc() {
    if (!id) return
    fetch(`/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => setDoc(data)).catch(() => console.warn('Failed to refetch doc'))
  }

  function handleRoutingSuccess(updatedDoc: { id: number; status: string; current_department: { id: number; code: string; name: string } }) {
    setDoc(prev => prev ? { ...prev, status: updatedDoc.status, current_department: updatedDoc.current_department } : prev)
    refetchDoc()
  }

  const handleDragStart = useCallback((idx: number) => setDragIdx(idx), [])
  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx) }, [])
  const handleDragLeave = useCallback(() => setOverIdx(null), [])
  const handleDragEnd = useCallback(() => { setDragIdx(null); setOverIdx(null) }, [])

  const handleDrop = useCallback((dropIdx: number) => {
    if (dragIdx === null || !doc) return
    setDragIdx(null); setOverIdx(null)
    const docId = doc.id
    const tokenVal = token
    setDoc(prev => {
      if (!prev) return prev
      const atts = [...prev.attachments]
      const [moved] = atts.splice(dragIdx, 1)
      atts.splice(dropIdx, 0, moved)
      const orderedIds = atts.map(a => a.id)
      const t = tokenVal ?? localStorage.getItem('noneco_token') ?? ''
      fetch(`/api/documents/${docId}/attachments/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }).then(r => { if (!r.ok) throw new Error() }).catch(() => {
        fetch(`/api/documents/${docId}`, { headers: { Authorization: `Bearer ${t}` } })
          .then(r => r.json()).then(data => setDoc(data)).catch(() => {})
      })
      return { ...prev, attachments: atts }
    })
  }, [dragIdx, doc, token])

  async function handleMarkComplete() {
    setCompleting(true)
    setDoc(prev => prev ? { ...prev, status: 'completed' } : prev)
    try {
      const res = await fetch(`/api/documents/${id}/complete`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || 'Failed to mark complete.')
      }
      refetchDoc()
    } catch (err) {
      refetchDoc()
      showToast(err instanceof Error ? err.message : 'Failed to mark complete.', 'error')
    } finally { setCompleting(false); setShowCompleteConfirm(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      navigate('/documents')
    } catch {
      console.warn('Failed to delete')
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  async function handleRecall() {
    if (!recallReason.trim()) { setRecallError('Please provide a reason for the recall.'); return }
    setRecallError('')
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
      const updated = await res.json()
      setDoc(prev => prev ? { ...prev, status: updated.status, current_department: updated.current_department } : prev)
      refetchDoc()
    } catch (err) {
      refetchDoc()
      showToast(err instanceof Error ? err.message : 'Failed to recall document.', 'error')
    } finally {
      setRecalling(false)
    }
  }

  async function handleAssignFlow() {
    if (!selectedFlowId) return
    setAssignLoading(true)
    try {
      const res = await fetch(`/api/approvals/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ flow_id: selectedFlowId })
      })
      if (!res.ok) throw new Error('Failed to assign flow')
      setShowAssignFlow(false)
      setSelectedFlowId('')
      setApprovalsLoading(true)
      fetch(`/api/approvals/${id}/approvals`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => setApprovals(data))
        .finally(() => setApprovalsLoading(false))
    } catch (err) {
      console.warn('Assign flow failed', err)
    } finally {
      setAssignLoading(false)
    }
  }

  async function handleArchive() {
    setArchiving(true)
    setDoc(prev => prev ? { ...prev, is_archived: true } : prev)
    try {
      const res = await fetch(`/api/documents/${id}/archive`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || 'Failed to archive.')
      }
      refetchDoc()
    } catch (err) {
      refetchDoc()
      showToast(err instanceof Error ? err.message : 'Failed to archive.', 'error')
    } finally { setArchiving(false); setShowArchiveConfirm(false) }
  }

  async function handleRestore() {
    setArchiving(true)
    setDoc(prev => prev ? { ...prev, is_archived: false } : prev)
    try {
      const res = await fetch(`/api/documents/${id}/restore`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || 'Failed to restore.')
      }
      refetchDoc()
    } catch (err) {
      refetchDoc()
      showToast(err instanceof Error ? err.message : 'Failed to restore.', 'error')
    } finally { setArchiving(false) }
  }

  async function handleDeleteAttachment() {
    if (!deleteAttId || !doc) return
    try {
      const t = token ?? localStorage.getItem('noneco_token') ?? ''
      const res = await fetch(`/api/documents/${doc.id}/attachments/${deleteAttId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err?.error?.message || 'Failed to delete attachment.', 'error')
        return
      }
      setDoc(prev => prev ? { ...prev, attachments: prev.attachments.filter(a => String(a.id) !== deleteAttId) } : prev)
      showToast('Attachment deleted.', 'success')
    } catch {
      showToast('Unable to connect. Please try again.', 'error')
    } finally {
      setDeleteAttId(null)
      setDeleteAttName('')
    }
  }

  useEffect(() => {
    if (!id) return
    setLoading(true); setError('')
    fetch(`/api/documents/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => setDoc(data))
      .catch(() => setError('Failed to load document.'))
      .finally(() => setLoading(false))
    fetch(`/api/documents/${id}/versions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setVersions(data))
      .catch(() => console.warn('Failed to load versions'))
    setApprovalsLoading(true)
    fetch(`/api/approvals/${id}/approvals`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setApprovals(data))
      .catch(() => console.warn('Failed to load approvals'))
      .finally(() => setApprovalsLoading(false))
    if (user?.role === 'admin' || user?.role === 'department_head' || user?.role === 'staff') {
      fetch('/api/approvals/flows', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(data => setFlows(data))
        .catch(() => console.warn('Failed to load flows'))
    }
  }, [id, token, user?.role])

  if (loading) return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 py-5 border-b border-stone-700/50">
        <div className="max-w-5xl mx-auto"><Skeleton className="h-6 w-64 mb-2" /><Skeleton className="h-4 w-48" /></div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 p-6 space-y-4">
          <Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-2 gap-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-24" /></div>
        </div>
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
  const isOwnDoc = user?.id === String(doc.created_by?.id)
  const canMarkComplete = user?.role === 'staff' || user?.role === 'department_head' || user?.role === 'admin'
  const canDelete = user?.role === 'admin'
  const canForward = !isCompleted && (user?.role === 'admin' || user?.departmentId === String(doc.current_department.id) || isOwnDoc)
  const canReturn = !isCompleted && (user?.role === 'admin' || user?.departmentId === String(doc.current_department.id) || isOwnDoc)
  const canRecall = !isCompleted
    && doc.current_department.id !== doc.originating_department.id
    && (user?.role === 'admin' || user?.departmentId === String(doc.originating_department.id))
  const canArchive = user?.role === 'admin' || user?.role === 'department_head'

  return (
    <>
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-4 sm:px-6 py-4 sm:py-5 border-b border-stone-700/50">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/documents')}
              className="flex-shrink-0 min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors">
              ← Back
            </button>
            <div className="min-w-0">
              <p className="text-xs font-mono text-stone-400">{doc.tracking_number}</p>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight truncate">{doc.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <Link to={isCompleted ? '#' : `/documents/${doc.id}/edit`}
              onClick={e => isCompleted && e.preventDefault()}
              className={`inline-flex items-center min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors ${isCompleted ? 'opacity-50 pointer-events-none' : ''}`}>
              Edit
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/documents/${doc.id}/qr-cover`, { headers: { Authorization: `Bearer ${token}` } })
                  if (!res.ok) return
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  window.open(url, '_blank', 'noopener,noreferrer')
                  setTimeout(() => URL.revokeObjectURL(url), 60000)
                } catch {}
              }}
              className="inline-flex items-center min-h-[40px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors">
              Print Cover Sheet
            </button>
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
        <div className="bg-white rounded-2xl border border-stone-200 shadow-card p-4 mb-4 dark:bg-stone-800/80 dark:border-stone-700">
          <span className="block text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">Actions</span>
          <div className="flex flex-wrap gap-2">
            {/* Routing group */}
            {canForward && (
              <button onClick={() => setShowForwardModal(true)}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-violet-600 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors">
                Forward
              </button>
            )}
            {canReturn && (
              <button onClick={() => setShowReturnModal(true)}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-amber-500 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors">
                Return
              </button>
            )}
            {canRecall && (
              <button onClick={() => setShowRecallConfirm(true)} disabled={recalling}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-stone-600 text-sm font-medium text-white hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400 disabled:opacity-50 transition-colors">
                Recall
              </button>
            )}

            {/* Separator */}
            {(canForward || canReturn || canRecall) && <div className="w-px bg-stone-200 dark:bg-stone-600 my-1" />}

            {/* Work group */}
            {!isCompleted && (
              <button onClick={() => setShowActionModal(true)}
                className="min-h-[40px] px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
                Record Action
              </button>
            )}
            {canMarkComplete && (
              <button disabled={isCompleted || completing} onClick={() => setShowCompleteConfirm(true)}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 transition-colors">
                {completing ? 'Completing…' : 'Mark Complete'}
              </button>
            )}

            {/* Separator */}
            {canMarkComplete && <div className="w-px bg-stone-200 dark:bg-stone-600 my-1" />}

            {/* Archive group */}
            {canArchive && (
              doc.is_archived ? (
                <button onClick={handleRestore} disabled={archiving}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors">
                  {archiving ? 'Restoring…' : 'Restore'}
                </button>
              ) : (
                <button onClick={() => setShowArchiveConfirm(true)} disabled={archiving}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors">
                  Archive
                </button>
              )
            )}
          </div>
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
                    {doc.attachments.map((att, idx) => (
                      <li key={att.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragLeave={handleDragLeave}
                        onDragEnd={handleDragEnd}
                        onDrop={() => handleDrop(idx)}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 transition-colors cursor-grab active:cursor-grabbing ${dragIdx === idx ? 'opacity-40' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'border-t-2 border-violet-400' : ''}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-4 h-4 text-stone-300 dark:text-stone-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{att.original_name}</p>
                            <p className="text-xs text-stone-500 dark:text-stone-400">{formatBytes(att.file_size_bytes)} · {att.uploaded_by.full_name} · {formatDateTime(att.uploaded_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(att.mime_type.startsWith('image/') || att.mime_type === 'application/pdf') && (
                            <button onClick={() => setPreviewAttachment(att)}
                              className="min-h-[36px] px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">
                              Preview
                            </button>
                          )}
                          <button onClick={async () => {
                            try {
                              const t = token ?? localStorage.getItem('noneco_token') ?? ''
                              const res = await fetch(`/api/documents/${doc.id}/attachments/${att.id}/download`, {
                                headers: { Authorization: `Bearer ${t}` },
                              })
                              if (!res.ok) throw new Error()
                              const blob = await res.blob()
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = att.original_name
                              document.body.appendChild(a)
                              a.click()
                              document.body.removeChild(a)
                              URL.revokeObjectURL(url)
                            } catch {
                              showToast('Download failed.', 'error')
                            }
                          }}
                            className="min-h-[36px] px-3.5 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors dark:bg-stone-800 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-700">
                            Download
                          </button>
                          {String(att.uploaded_by.id) === String(user?.id) && (
                            <button onClick={() => {
                              setDeleteAttId(String(att.id))
                              setDeleteAttName(att.original_name)
                            }}
                              className="min-h-[36px] px-3.5 py-2 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors dark:bg-stone-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30">
                              Delete
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <AttachmentUpload documentId={String(doc.id)} token={token ?? ''} disabled={isCompleted}
                  onUploaded={att => {
                    setDoc(prev => prev ? { ...prev, attachments: [...prev.attachments, att] } : prev)
                  }} />
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

            {/* Approvals */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden mt-4 dark:bg-stone-800/80 dark:border-stone-700">
              <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Approvals</h2>
                  <span className="text-xs font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full dark:bg-stone-700 dark:text-stone-300">{approvals.length}</span>
                </div>
                {(user?.role === 'admin' || user?.role === 'department_head' || user?.role === 'staff') && approvals.length === 0 && flows.length > 0 && (
                  <button onClick={() => setShowAssignFlow(true)} className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400">Assign Flow</button>
                )}
              </div>
              <div className="p-5">
                {approvalsLoading ? (
                  <p className="text-xs text-stone-400 dark:text-stone-500">Loading...</p>
                ) : approvals.length === 0 ? (
                  <div>
                    <p className="text-xs text-stone-400 dark:text-stone-500">No approvals assigned.</p>
                    {showAssignFlow && (
                      <div className="mt-3 space-y-2">
                        <select value={selectedFlowId} onChange={e => setSelectedFlowId(e.target.value)} className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
                          <option value="">Select a flow…</option>
                          {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={handleAssignFlow} disabled={!selectedFlowId || assignLoading} className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">{assignLoading ? 'Assigning...' : 'Assign'}</button>
                          <button onClick={() => setShowAssignFlow(false)} className="px-3 py-1.5 text-xs font-medium rounded-xl border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-stone-100 dark:divide-stone-700/60">
                    {approvals.map(a => (
                      <li key={a.id} className="py-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-mono font-medium text-stone-400">#{a.step_order}</span>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                              a.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                              a.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>{a.status}</span>
                          </div>
                          <p className="text-xs text-stone-700 dark:text-stone-300 mt-0.5">{a.label}</p>
                          {a.decided_by_name && (
                            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">by {a.decided_by_name}{a.decided_at ? ' ' + formatDateTime(a.decided_at) : ''}</p>
                          )}
                          {a.comment && <p className="text-[11px] text-stone-500 dark:text-stone-400 italic mt-0.5">"{a.comment}"</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Versions */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-card overflow-hidden mt-4 dark:bg-stone-800/80 dark:border-stone-700">
              <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-700 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Versions</h2>
                <span className="text-xs font-medium bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full dark:bg-stone-700 dark:text-stone-300">{versions.length}</span>
              </div>
              <div className="p-5">
                {versions.length === 0 ? (
                  <p className="text-xs text-stone-400 dark:text-stone-500">No previous versions.</p>
                ) : (
                  <ul className="divide-y divide-stone-100 dark:divide-stone-700/60">
                    {versions.map(v => (
                      <li key={v.id} className="py-2.5">
                        <button
                          className="w-full text-left flex items-center justify-between gap-2"
                          onClick={() => setExpandedVersion(expandedVersion === v.id ? null : v.id)}
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-mono font-semibold text-stone-700 dark:text-stone-300">v{v.version}</span>
                            <span className="text-xs text-stone-500 dark:text-stone-400 ml-2">{v.changed_by.full_name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-stone-400 tabular-nums">{formatDateTime(v.changed_at)}</span>
                            <svg className={`w-3 h-3 text-stone-400 transition-transform ${expandedVersion === v.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {expandedVersion === v.id && (
                          <pre className="mt-2 text-xs text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                            {JSON.stringify(v.snapshot, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
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

    {showForwardModal && id && <RoutingModal documentId={id} token={token ?? ''} currentDepartmentId={doc.current_department.id} onSuccess={handleRoutingSuccess} onClose={() => setShowForwardModal(false)} />}
    {showReturnModal && id && <ReturnModal documentId={id} token={token ?? ''} returnToDept={doc.originating_department} onSuccess={handleRoutingSuccess} onClose={() => setShowReturnModal(false)} />}
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

    {showArchiveConfirm && (
      <ConfirmDialog title="Archive Document"
        message={`Archive "${doc.title}"? It will be hidden from the default document list and can be restored later.`}
        confirmLabel="Archive" onConfirm={handleArchive} onCancel={() => setShowArchiveConfirm(false)} />
    )}

    {previewAttachment && id && (
      <PreviewModal attachment={previewAttachment} docId={id} onClose={() => setPreviewAttachment(null)} />
    )}

    {showRecallConfirm && (
      <div role="dialog" aria-modal="true" aria-labelledby="recall-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          onClick={() => { setShowRecallConfirm(false); setRecallReason(''); setRecallError('') }} aria-hidden="true" />
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
              {recallError && (
                <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {recallError}
                </p>
              )}
            </div>
            <div className="flex gap-2.5 pt-1 border-t border-stone-100 dark:border-stone-700">
              <button type="button"
                onClick={() => { setShowRecallConfirm(false); setRecallReason(''); setRecallError('') }}
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

    {deleteAttId && (
      <ConfirmDialog title="Delete Attachment"
        message={`Permanently delete "${deleteAttName}"? This cannot be undone.`}
        confirmLabel="Delete" onConfirm={handleDeleteAttachment} onCancel={() => { setDeleteAttId(null); setDeleteAttName('') }} danger />
    )}
    </>
  )
}
