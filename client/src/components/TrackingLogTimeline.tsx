export interface TrackingEntry {
  id: number
  event_type: string
  remarks: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  user: { id: number; full_name: string }
  department: { id: number; code: string; name: string }
}

const EVENT_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  created:         { label: 'Created',         color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',         dot: 'bg-sky-500' },
  forwarded:       { label: 'Forwarded',       color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', dot: 'bg-violet-500' },
  returned:        { label: 'Returned',        color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',   dot: 'bg-amber-500' },
  action_recorded: { label: 'Action Recorded', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',       dot: 'bg-blue-500' },
  completed:       { label: 'Completed',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-500' },
  edited:          { label: 'Edited',          color: 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',      dot: 'bg-stone-400' },
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

export default function TrackingLogTimeline({ entries }: { entries: TrackingEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-stone-400 dark:text-stone-500">No tracking entries yet.</p>
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry, idx) => {
        const cfg = EVENT_CONFIG[entry.event_type] ?? { label: entry.event_type, color: 'bg-stone-100 text-stone-600', dot: 'bg-stone-400' }
        const isLast = idx === entries.length - 1

        // Extract destination dept from metadata for forwarded/returned
        const toDeptId = entry.metadata?.to_department_id as string | undefined
        const toDeptCode = entry.metadata?.to_department_code as string | undefined

        return (
          <li key={entry.id} className="flex gap-3">
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                entry.event_type === 'completed' ? 'bg-emerald-500' :
                entry.event_type === 'forwarded' ? 'bg-violet-500' :
                entry.event_type === 'returned'  ? 'bg-amber-500' :
                entry.event_type === 'created'   ? 'bg-sky-500' : 'bg-stone-400'
              }`}>
                {getInitials(entry.user.full_name)}
              </div>
              {!isLast && <div className="w-px flex-1 bg-stone-200 dark:bg-stone-700 mt-1" />}
            </div>

            {/* Content */}
            <div className="flex-1 pb-4 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">
                  {entry.user.full_name}
                </span>
                <span className="text-xs text-stone-400 dark:text-stone-500">·</span>
                <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  {entry.department.code}
                </span>
                {/* Show destination for forwarded/returned */}
                {(entry.event_type === 'forwarded' || entry.event_type === 'returned') && (toDeptCode || toDeptId) && (
                  <>
                    <svg className="w-3 h-3 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                      {toDeptCode ?? toDeptId}
                    </span>
                  </>
                )}
              </div>

              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>

              {entry.remarks && (
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-1.5 leading-relaxed">{entry.remarks}</p>
              )}

              <time className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 block">
                {formatDateTime(entry.created_at)}
              </time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
