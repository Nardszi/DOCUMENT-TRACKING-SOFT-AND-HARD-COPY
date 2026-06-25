interface DeadlineBadgeProps {
  deadline: string | null
  isOverdue?: boolean
}

import { memo } from 'react'

function formatDateLocal(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const DeadlineBadge = memo(function DeadlineBadge({ deadline, isOverdue }: DeadlineBadgeProps) {
  if (!deadline) return <span className="text-sm text-stone-400 dark:text-stone-500">—</span>

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-sm ${isOverdue ? 'text-red-700 font-medium dark:text-red-400' : 'text-stone-700 dark:text-stone-300'}`}>
        {formatDateLocal(deadline)}
      </span>
      {isOverdue && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
          OVERDUE
        </span>
      )}
    </span>
  )
})

export default DeadlineBadge
