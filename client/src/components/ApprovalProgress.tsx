import { memo } from 'react'

interface Step {
  id: number; step_order: number; label: string; status: string
  assigned_department_name: string | null; assigned_to_name: string | null
}

interface Props {
  steps: Step[]
  compact?: boolean
}

const STATUS_CONFIG: Record<string, { bg: string; ring: string; icon: React.ReactNode }> = {
  approved: {
    bg: 'bg-emerald-500',
    ring: 'ring-emerald-200 dark:ring-emerald-800/40',
    icon: <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>,
  },
  rejected: {
    bg: 'bg-red-500',
    ring: 'ring-red-200 dark:ring-red-800/40',
    icon: <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>,
  },
  pending: {
    bg: 'bg-stone-200 dark:bg-stone-700',
    ring: 'ring-stone-100 dark:ring-stone-800',
    icon: null,
  },
}

function ApprovalProgress({ steps, compact = false }: Props) {
  if (!steps || steps.length === 0) return null
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order)
  const approved = sorted.filter(s => s.status === 'approved').length
  const total = sorted.length

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1">
          {sorted.map(step => {
            const cfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending
            return (
              <div key={step.id} className={`w-4 h-4 rounded-full flex items-center justify-center ring-2 ${cfg.bg} ${cfg.ring}`}>
                {cfg.icon}
              </div>
            )
          })}
        </div>
        <span className="text-[10px] font-medium text-stone-400 dark:text-stone-500">{approved}/{total}</span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Approval Progress</span>
        <span className="text-[10px] font-medium text-stone-500">{approved}/{total} steps</span>
      </div>
      <div className="flex items-center gap-1">
        {sorted.map((step, i) => {
          const cfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending
          return (
            <div key={step.id} className="flex items-center gap-1 flex-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ring-2 ${cfg.bg} ${cfg.ring} shrink-0`}>
                {cfg.icon}
              </div>
              {i < sorted.length - 1 && (
                <div className={`flex-1 h-0.5 rounded-full ${step.status === 'approved' ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-stone-200 dark:bg-stone-700'}`} />
              )}
            </div>
          )
        })}
      </div>
      {sorted.map(step => (
        <div key={step.id} className="flex items-center gap-2 text-[10px] text-stone-500">
          <span className={`font-medium ${step.status === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : step.status === 'rejected' ? 'text-red-600 dark:text-red-400' : ''}`}>{step.label}</span>
          {step.assigned_department_name && <span className="text-stone-400">· {step.assigned_department_name}</span>}
        </div>
      ))}
    </div>
  )
}

export default memo(ApprovalProgress)
