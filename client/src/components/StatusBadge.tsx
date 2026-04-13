type Status = 'pending' | 'in_progress' | 'forwarded' | 'returned' | 'completed'

const STATUS_CONFIG: Record<Status, { bg: string; text: string; dot: string; label: string }> = {
  pending:     { bg: 'bg-stone-100 dark:bg-stone-700/60',     text: 'text-stone-600 dark:text-stone-300',   dot: 'bg-stone-400 dark:bg-stone-400',   label: 'Pending' },
  in_progress: { bg: 'bg-amber-50 dark:bg-amber-900/30',      text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-500',                      label: 'In Progress' },
  forwarded:   { bg: 'bg-violet-50 dark:bg-violet-900/30',    text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500',                     label: 'Forwarded' },
  returned:    { bg: 'bg-red-50 dark:bg-red-900/30',          text: 'text-red-700 dark:text-red-300',       dot: 'bg-red-500',                        label: 'Returned' },
  completed:   { bg: 'bg-emerald-50 dark:bg-emerald-900/30',  text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500',                  label: 'Completed' },
}

export default function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as Status] ?? {
    bg: 'bg-stone-100 dark:bg-stone-700/60',
    text: 'text-stone-600 dark:text-stone-300',
    dot: 'bg-stone-400',
    label: status,
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  )
}
