export function inputCls(hasError: boolean): string {
  return `w-full rounded-lg border px-3 py-2.5 text-base text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500 ${
    hasError ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600' : 'border-amber-200 hover:border-amber-300 dark:border-stone-600'
  }`
}

export function selectCls(hasError: boolean): string {
  return inputCls(hasError)
}

export function fieldCls(): string {
  return 'w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-colors dark:bg-stone-700 dark:border-stone-600 dark:text-stone-100'
}
