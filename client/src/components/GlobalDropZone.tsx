import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function GlobalDropZone() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const counterRef = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    counterRef.current++
    if (e.dataTransfer?.types?.includes('Files')) {
      setDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    counterRef.current--
    if (counterRef.current === 0) setDragging(false)
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    counterRef.current = 0
    setDragging(false)
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    const fileNames = Array.from(files).map(f => f.name).join(',')
    const fileData = Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type }))
    sessionStorage.setItem('noneco_dropped_files', JSON.stringify(fileData))
    for (const file of files) {
      const dt = new DataTransfer()
      dt.items.add(file)
    }
    navigate('/documents/new', { state: { droppedFiles: fileNames } })
  }, [navigate])

  useEffect(() => {
    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop])

  if (!dragging) return null

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-amber-500/10 dark:bg-amber-500/5 backdrop-blur-[2px]" />
      <div className="relative bg-white dark:bg-stone-800 rounded-2xl border-2 border-dashed border-amber-400 dark:border-amber-500/60 shadow-2xl px-12 py-10 text-center animate-slide-up">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="text-lg font-bold text-stone-900 dark:text-stone-100">Drop files to create document</p>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">Release to open the document creation form</p>
      </div>
    </div>
  )
}
