import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import ConfirmDialog from './ConfirmDialog'
import { useToast } from './ToastContainer'

interface CommentUser {
  id: string
  full_name: string
  department: string
}

interface Comment {
  id: string
  content: string
  created_at: string
  updated_at: string
  user: CommentUser
}

interface CommentsSectionProps {
  documentId: string
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isEdited(comment: Comment): boolean {
  return new Date(comment.updated_at) > new Date(comment.created_at)
}

function isWithin24h(comment: Comment): boolean {
  return Date.now() - new Date(comment.created_at).getTime() < 24 * 60 * 60 * 1000
}

export default function CommentsSection({ documentId }: CommentsSectionProps) {
  const { user, token } = useAuth()
  const { showToast } = useToast()

  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  const [newText, setNewText] = useState('')
  const [newError, setNewError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editError, setEditError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  async function fetchComments() {
    try {
      const res = await fetch(`/api/documents/${documentId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load comments')
      const data: Comment[] = await res.json()
      // chronological order: oldest first
      setComments(data.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
    } catch {
      showToast('Failed to load comments', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newText.trim()) {
      setNewError('Comment cannot be empty.')
      return
    }
    setNewError('')
    setSubmitting(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/comments`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ content: newText.trim() }),
      })
      if (!res.ok) throw new Error()
      const created: Comment = await res.json()
      setComments((prev) => [...prev, created])
      setNewText('')
      showToast('Comment added', 'success')
    } catch {
      showToast('Failed to add comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id)
    setEditText(comment.content)
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditText('')
    setEditError('')
  }

  async function handleSaveEdit(commentId: string) {
    if (!editText.trim()) {
      setEditError('Comment cannot be empty.')
      return
    }
    setEditError('')
    try {
      const res = await fetch(`/api/documents/${documentId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ content: editText.trim() }),
      })
      if (!res.ok) throw new Error()
      const updated: Comment = await res.json()
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)))
      setEditingId(null)
      showToast('Comment updated', 'success')
    } catch {
      showToast('Failed to update comment', 'error')
    }
  }

  async function handleDelete(comment: Comment) {
    try {
      const res = await fetch(`/api/documents/${documentId}/comments/${comment.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error()
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      showToast('Comment deleted', 'success')
    } catch {
      showToast('Failed to delete comment', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const canEdit = (comment: Comment) =>
    user?.id === comment.user.id && isWithin24h(comment)

  const canDelete = (comment: Comment) =>
    user?.role === 'admin' || user?.id === comment.user.id

  if (loading) {
    return <p className="text-sm text-stone-500">Loading comments…</p>
  }

  return (
    <div className="space-y-4">
      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="text-sm text-stone-500">No comments yet. Be the first to comment.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border border-stone-200 bg-white p-4 dark:bg-stone-800 dark:border-stone-700">
              {editingId === comment.id ? (
                /* Edit mode */
                <div className="space-y-2">
                  <textarea
                    ref={textareaRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100"
                    aria-label="Edit comment"
                  />
                  {editError && (
                    <p role="alert" className="text-xs text-red-600">{editError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(comment.id)}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{comment.user.full_name}</span>
                      {comment.user.department && (
                        <span className="ml-1.5 text-xs text-stone-500 dark:text-stone-400">· {comment.user.department}</span>
                      )}
                      <span className="ml-1.5 text-xs text-stone-400 dark:text-stone-500">{formatDateTime(comment.created_at)}</span>
                      {isEdited(comment) && (
                        <span className="ml-1.5 text-xs text-stone-400 dark:text-stone-500 italic">(edited)</span>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {canEdit(comment) && (
                        <button
                          type="button"
                          onClick={() => startEdit(comment)}
                          className="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete(comment) && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(comment)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap">{comment.content}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* New comment form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        <label htmlFor="new-comment" className="sr-only">Add a comment</label>
        <textarea
          id="new-comment"
          value={newText}
          onChange={(e) => {
            setNewText(e.target.value)
            if (newError) setNewError('')
          }}
          rows={3}
          placeholder="Write a comment…"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100 dark:placeholder-stone-500"
        />
        {newError && (
          <p role="alert" className="text-xs text-red-600">{newError}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post Comment'}
        </button>
      </form>

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Comment"
          message="Are you sure you want to delete this comment? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}
    </div>
  )
}
