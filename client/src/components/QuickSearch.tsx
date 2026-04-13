import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import StatusBadge from './StatusBadge'

interface Document {
  id: string
  tracking_number: string
  title: string
  status: string
}

export default function QuickSearch() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Document[] | null>(null)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (val.length < 2) {
      setOpen(false)
      setResults(null)
      setError(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/documents/quick-search?q=${encodeURIComponent(val)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Network error')
        const json = await res.json()
        setResults(json.data ?? [])
        setError(false)
        setOpen(true)
      } catch {
        setError(true)
        setResults(null)
        setOpen(true)
      }
    }, 300)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 150)
  }

  function handleSelect(id: string) {
    setOpen(false)
    setQuery('')
    navigate(`/documents/${id}`)
  }

  return (
    <div className="relative px-3 py-2">
      <input
        type="search"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Quick search…"
        className="w-full rounded-md bg-stone-800 border border-stone-600 text-stone-100 placeholder-stone-400 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
        aria-label="Quick search documents"
        aria-autocomplete="list"
        aria-expanded={open}
      />

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-md bg-stone-800 border border-stone-600 shadow-lg overflow-hidden">
          {error ? (
            <p className="px-3 py-2 text-sm text-red-400">Search unavailable</p>
          ) : results && results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-400">No results found</p>
          ) : (
            <ul role="listbox">
              {(results ?? []).slice(0, 8).map((doc) => (
                <li
                  key={doc.id}
                  role="option"
                  aria-selected={false}
                  onMouseDown={() => handleSelect(doc.id)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-stone-700 text-sm"
                >
                  <span className="text-amber-400 font-mono text-xs shrink-0">
                    {doc.tracking_number}
                  </span>
                  <span className="text-stone-100 truncate flex-1">{doc.title}</span>
                  <StatusBadge status={doc.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
