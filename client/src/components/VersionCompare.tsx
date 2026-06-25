import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Skeleton from './Skeleton'

interface Version {
  id: number; version_number: number; snapshot: {
    title: string; description: string | null; priority: string
    category_name: string; deadline: string | null; status: string
  }; created_by_name: string; created_at: string
}

interface Props {
  documentId: string
  onClose: () => void
}

export default function VersionCompare({ documentId, onClose }: Props) {
  const { token } = useAuth()
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [leftIdx, setLeftIdx] = useState<number>(0)
  const [rightIdx, setRightIdx] = useState<number>(1)

  useEffect(() => {
    if (!token) return
    fetch(`/api/documents/${documentId}/versions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const v = Array.isArray(data) ? data : []
        setVersions(v)
        if (v.length >= 2) { setLeftIdx(0); setRightIdx(1) }
        else if (v.length === 1) { setLeftIdx(0); setRightIdx(0) }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, documentId])

  const left = versions[leftIdx]
  const right = versions[rightIdx]

  function diffClass(a: string | null, b: string | null) {
    if (a === b) return ''
    return 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800/40'
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800">
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Compare Versions</h2>
          <button onClick={onClose} aria-label="Close" className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-stone-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : versions.length < 2 ? (
          <div className="py-16 text-center text-sm text-stone-500">Need at least 2 versions to compare.</div>
        ) : (
          <>
            {/* Version selectors */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900">
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Older Version</label>
                <select value={leftIdx} onChange={e => setLeftIdx(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 px-3 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {versions.map((v, i) => <option key={v.id} value={i}>v{v.version_number} — {new Date(v.created_at).toLocaleDateString()}</option>)}
                </select>
              </div>
              <svg className="w-5 h-5 text-stone-400 mt-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Newer Version</label>
                <select value={rightIdx} onChange={e => setRightIdx(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 px-3 py-1.5 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {versions.map((v, i) => <option key={v.id} value={i}>v{v.version_number} — {new Date(v.created_at).toLocaleDateString()}</option>)}
                </select>
              </div>
            </div>

            {/* Diff table */}
            {left && right && (
              <div className="overflow-auto flex-1 p-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-700">
                      <th className="text-left py-2 text-xs font-medium text-stone-400 uppercase tracking-wide w-1/4">Field</th>
                      <th className="text-left py-2 text-xs font-medium text-stone-400 uppercase tracking-wide w-[37.5%]">v{left.version_number}</th>
                      <th className="text-left py-2 text-xs font-medium text-stone-400 uppercase tracking-wide w-[37.5%]">v{right.version_number}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50 dark:divide-stone-800">
                    {(['title', 'description', 'priority', 'category_name', 'deadline', 'status'] as const).map(field => {
                      const leftVal = left.snapshot[field] ?? '—'
                      const rightVal = right.snapshot[field] ?? '—'
                      const changed = leftVal !== rightVal
                      const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                      return (
                        <tr key={field} className={changed ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                          <td className="py-2.5 pr-3">
                            <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">{label}</span>
                            {changed && <span className="ml-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">CHANGED</span>}
                          </td>
                          <td className={`py-2.5 pr-3 rounded-l-lg ${diffClass(String(leftVal), String(rightVal))}`}>
                            <span className="text-sm text-stone-700 dark:text-stone-300 break-words">{leftVal || '—'}</span>
                          </td>
                          <td className={`py-2.5 rounded-r-lg ${diffClass(String(leftVal), String(rightVal))}`}>
                            <span className="text-sm text-stone-700 dark:text-stone-300 break-words">{rightVal || '—'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
