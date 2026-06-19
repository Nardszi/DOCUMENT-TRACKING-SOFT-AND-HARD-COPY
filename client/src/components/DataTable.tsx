import { useState, useMemo, ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  className?: string
  render?: (row: T, index: number) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T, index: number) => string | number
  emptyMessage?: string
  emptyIcon?: ReactNode
  onRowClick?: (row: T) => void
  loading?: boolean
  className?: string
  compact?: boolean
}

type SortDirection = 'asc' | 'desc' | null

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No entries found.',
  emptyIcon,
  onRowClick,
  loading = false,
  className = '',
  compact = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc')
      if (sortDir === 'desc') setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data
    return [...data].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  const py = compact ? 'px-3 py-2' : 'px-4 py-3'

  if (loading) {
    return (
      <div className={`bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden ${className}`}>
        <div className="p-8 text-center text-sm text-stone-400 dark:text-stone-500">Loading…</div>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className={`bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden ${className}`}>
        <div className="py-16 text-center">
          {emptyIcon ?? (
            <svg className="w-10 h-10 mx-auto mb-3 text-stone-300 dark:text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          <p className="text-sm text-stone-500 dark:text-stone-400">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 overflow-x-auto shadow-card ${className}`}>
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800">
            {columns.map(col => (
              <th
                key={col.key}
                className={`${py} text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 select-none ${col.sortable ? 'cursor-pointer hover:text-stone-700 dark:hover:text-stone-200' : ''} ${col.className ?? ''}`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1.5">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <svg className={`w-3.5 h-3.5 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50 dark:divide-stone-700/60">
          {sorted.map((row, idx) => (
            <tr
              key={keyExtractor(row, idx)}
              className={`${onRowClick ? 'cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map(col => (
                <td key={col.key} className={`${py} ${col.className ?? ''}`}>
                  {col.render ? col.render(row, idx) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
