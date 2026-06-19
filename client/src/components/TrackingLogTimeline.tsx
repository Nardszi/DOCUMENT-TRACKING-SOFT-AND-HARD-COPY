export interface TrackingEntry {
  id: number
  event_type: string
  remarks: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  user: { id: number; full_name: string }
  department: { id: number; code: string; name: string }
}

const EVENT_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  created:         { label: 'Created',         icon: 'M12 4v16m8-8H4',            bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300' },
  forwarded:       { label: 'Forwarded',       icon: 'M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4', bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
  returned:        { label: 'Returned',        icon: 'M21 10H11a5 5 0 00-5 5v2m10-7l-4 4m4-4l-4-4', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  action_recorded: { label: 'Action',          icon: 'M9 12l2 2 4-4',             bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  completed:       { label: 'Completed',       icon: 'M5 13l4 4L19 7',            bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  edited:          { label: 'Edited',          icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z', bg: 'bg-stone-100 dark:bg-stone-700', text: 'text-stone-600 dark:text-stone-300' },
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function TrackingLogTimeline({ entries }: { entries: TrackingEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-stone-400 dark:text-stone-500">No tracking entries yet.</p>
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, idx) => {
        const cfg = EVENT_CONFIG[entry.event_type] ?? { label: entry.event_type, icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', bg: 'bg-stone-100', text: 'text-stone-600' }
        const isLast = idx === entries.length - 1
        const toDeptCode = entry.metadata?.to_department_code as string | undefined
        const routingNote = entry.metadata?.routing_note as string | undefined

        return (
          <li key={entry.id} className="flex gap-3 relative">
            {/* Timeline connector */}
            <div className="flex flex-col items-center w-8">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                <svg className={`w-4 h-4 ${cfg.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cfg.icon} />
                </svg>
              </div>
              {!isLast && <div className="w-px flex-1 bg-stone-200 dark:bg-stone-700 my-1" />}
            </div>

            {/* Content */}
            <div className="flex-1 pb-4 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{entry.user.full_name}</span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                {toDeptCode && (
                  <span className="text-[11px] text-stone-400 dark:text-stone-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    {toDeptCode}
                  </span>
                )}
              </div>

              {routingNote && (
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-relaxed bg-stone-50 dark:bg-stone-800 rounded-lg px-2.5 py-1.5 border border-stone-100 dark:border-stone-700">
                  {routingNote}
                </p>
              )}

              <time className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 block">{formatDateTime(entry.created_at)}</time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
