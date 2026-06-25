import { useState, useEffect } from 'react'

const STORAGE_KEY = 'noneco_dashboard_layout'

export interface WidgetConfig {
  id: string
  label: string
  visible: boolean
  order: number
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'kpi', label: 'KPI Cards', visible: true, order: 0 },
  { id: 'bottleneck', label: 'Bottleneck Alert', visible: true, order: 1 },
  { id: 'action', label: 'Needs Action', visible: true, order: 2 },
  { id: 'deadlines', label: 'Deadlines', visible: true, order: 3 },
  { id: 'documents', label: 'Department Documents', visible: true, order: 4 },
  { id: 'activity', label: 'Activity Feed', visible: true, order: 5 },
]

export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as WidgetConfig[]
        const merged = DEFAULT_WIDGETS.map(dw => {
          const found = parsed.find(p => p.id === dw.id)
          return found ? { ...dw, visible: found.visible, order: found.order } : dw
        })
        return merged.sort((a, b) => a.order - b.order)
      }
    } catch {}
    return DEFAULT_WIDGETS
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
  }, [widgets])

  function toggleWidget(id: string) {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  function moveWidget(id: string, direction: 'up' | 'down') {
    setWidgets(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex(w => w.id === id)
      if (idx === -1) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= sorted.length) return prev
      const temp = sorted[idx].order
      sorted[idx] = { ...sorted[idx], order: sorted[target].order }
      sorted[target] = { ...sorted[target], order: temp }
      return sorted
    })
  }

  function resetWidgets() {
    setWidgets(DEFAULT_WIDGETS)
  }

  return { widgets, toggleWidget, moveWidget, resetWidgets }
}

export default function DashboardWidgetSettings({ widgets, onToggle, onMove, onReset, onClose }: {
  widgets: WidgetConfig[]
  onToggle: (id: string) => void
  onMove: (id: string, dir: 'up' | 'down') => void
  onReset: () => void
  onClose: () => void
}) {
  const sorted = [...widgets].sort((a, b) => a.order - b.order)

  return (
    <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-2xl z-50 overflow-hidden animate-slide-up">
      <div className="px-4 py-2.5 border-b border-stone-100 dark:border-stone-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Customize Widgets</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <ul className="py-1">
        {sorted.map((w, i) => (
          <li key={w.id} className="flex items-center gap-2 px-4 py-2 hover:bg-stone-50 dark:hover:bg-stone-700/50">
            <div className="flex flex-col gap-0.5">
              <button onClick={() => onMove(w.id, 'up')} disabled={i === 0} className="p-0.5 text-stone-400 hover:text-stone-600 disabled:opacity-30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
              </button>
              <button onClick={() => onMove(w.id, 'down')} disabled={i === sorted.length - 1} className="p-0.5 text-stone-400 hover:text-stone-600 disabled:opacity-30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <span className="flex-1 text-sm text-stone-700 dark:text-stone-300">{w.label}</span>
            <button onClick={() => onToggle(w.id)}
              className={`relative w-9 h-5 rounded-full transition-colors ${w.visible ? 'bg-amber-500' : 'bg-stone-300 dark:bg-stone-600'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${w.visible ? 'translate-x-4' : ''}`} />
            </button>
          </li>
        ))}
      </ul>
      <div className="px-4 py-2 border-t border-stone-100 dark:border-stone-700">
        <button onClick={onReset} className="text-xs text-stone-500 hover:text-stone-700 dark:hover:text-stone-300">Reset to defaults</button>
      </div>
    </div>
  )
}
