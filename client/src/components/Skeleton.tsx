interface SkeletonProps {
  className?: string
  count?: number
}

export default function Skeleton({ className = '', count = 1 }: SkeletonProps) {
  const base = 'skeleton'

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${base} ${className}`} aria-hidden="true" />
      ))}
    </>
  )
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <table className="w-full text-base text-left">
      <thead className="bg-stone-50 border-b border-stone-200 dark:bg-stone-800 dark:border-stone-700">
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="px-4 py-3"><Skeleton className="h-3 w-20" /></th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-stone-800/80 rounded-2xl border border-stone-200 dark:border-stone-700 p-5 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </>
  )
}
