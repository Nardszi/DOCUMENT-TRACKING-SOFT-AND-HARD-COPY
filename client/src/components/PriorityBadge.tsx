type Priority = 'low' | 'normal' | 'high' | 'urgent'

const PRIORITY_CONFIG: Record<Priority, { bg: string; text: string; dot: string; label: string }> = {
  low:    { bg: 'bg-stone-100 dark:bg-stone-700/60',   text: 'text-stone-500 dark:text-stone-400',   dot: 'bg-stone-400',   label: 'Low' },
  normal: { bg: 'bg-sky-50 dark:bg-sky-900/30',        text: 'text-sky-700 dark:text-sky-300',       dot: 'bg-sky-500',     label: 'Normal' },
  high:   { bg: 'bg-orange-50 dark:bg-orange-900/30',  text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500',  label: 'High' },
  urgent: { bg: 'bg-red-50 dark:bg-red-900/30',        text: 'text-red-700 dark:text-red-300',       dot: 'bg-red-500 animate-pulse', label: 'Urgent' },
}

export default function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority.toLowerCase() as Priority] ?? {
    bg: 'bg-stone-100 dark:bg-stone-700/60',
    text: 'text-stone-500 dark:text-stone-400',
    dot: 'bg-stone-400',
    label: priority,
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  )
}
