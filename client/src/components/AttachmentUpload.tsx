import { useRef, useState, DragEvent, ChangeEvent } from 'react'

interface Attachment {
  id: number
  original_name: string
  filename: string
  mime_type: string
  file_size_bytes: number
  uploaded_by: { id: number; full_name: string }
  uploaded_at: string
}

interface Props {
  documentId: string
  token: string
  disabled?: boolean
  multiple?: boolean
  onUploaded: (attachment: Attachment) => void
}

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
])

const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

function validateFile(file: File): string | null {
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return 'Invalid file type. Allowed: PDF, DOCX, XLSX, PNG, JPG.'
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'File is too large. Maximum size is 20 MB.'
  }
  return null
}

export default function AttachmentUpload({ documentId, token, disabled, multiple = false, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [currentFile, setCurrentFile] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (disabled) {
    return (
      <p className="text-sm text-gray-500 italic mt-2">
        Attachments cannot be added to completed documents.
      </p>
    )
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const validFiles: File[] = []
    for (const file of Array.from(files)) {
      const validationError = validateFile(file)
      if (validationError) { setError(validationError); return }
      validFiles.push(file)
    }
    setError(null)
    if (multiple) setSelectedFiles(prev => [...prev, ...validFiles])
    else setSelectedFiles(validFiles.slice(0, 1))
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  function handleUpload() {
    if (selectedFiles.length === 0) return
    setError(null); setUploading(true); setProgress(0)

    async function uploadAll() {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        setCurrentFile(file.name)
        setProgress(Math.round((i / selectedFiles.length) * 100))
        await new Promise<void>((resolve, _reject) => {
          const formData = new FormData()
          formData.append('file', file)
          const xhr = new XMLHttpRequest()
          xhr.upload.addEventListener('progress', () => {
            setProgress(Math.round(((i + 0.5) / selectedFiles.length) * 100))
          })
          xhr.addEventListener('load', () => {
            if (xhr.status === 200 || xhr.status === 201) {
              try { const att: Attachment = JSON.parse(xhr.responseText); onUploaded(att) } catch {}
              resolve()
            } else {
              try { const body = JSON.parse(xhr.responseText); setError(body?.error?.message ?? 'Upload failed.') } catch { setError('Upload failed.') }
              resolve()
            }
          })
          xhr.addEventListener('error', () => { setError('Network error.'); resolve() })
          xhr.open('POST', `/api/documents/${documentId}/attachments`)
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          xhr.send(formData)
        })
      }
      setSelectedFiles([]); setUploading(false); setProgress(null); setCurrentFile('')
    }
    uploadAll()
  }

  function handleClear() {
    setSelectedFiles([])
    setError(null)
    setProgress(null)
    setUploading(false)
  }

  function removeFile(idx: number) {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const isUploading = uploading

  return (
    <div className="mt-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="File upload area. Drag and drop a file here or press Enter to browse."
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
            inputRef.current?.click()
          }
        }}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <svg
          className="mx-auto mb-2 w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <p className="text-base text-gray-600">
          Drag &amp; drop {multiple ? 'files' : 'a file'} here, or{' '}
          <span className="text-blue-600 font-medium underline">browse files</span>
        </p>
        <p className="text-sm text-gray-400 mt-1">PDF, DOCX, XLSX, PNG, JPG — max 20 MB{multiple ? ' each' : ''}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
        multiple={multiple}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleInputChange}
      />

      {/* Selected files + upload button */}
      {selectedFiles.length > 0 && !isUploading && (
        <div className="mt-3 space-y-2">
          {selectedFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-2 bg-stone-50 dark:bg-stone-800 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-stone-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className="text-sm text-stone-700 dark:text-stone-300 truncate flex-1">{file.name}</span>
              <span className="text-xs text-stone-400">{(file.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => removeFile(i)} className="p-1 text-stone-400 hover:text-red-500 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleUpload}
              className="min-h-[44px] px-4 py-2 rounded-md bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors">
              Upload {selectedFiles.length > 1 ? `${selectedFiles.length} files` : 'File'}
            </button>
            <button type="button" onClick={handleClear}
              className="min-h-[44px] px-3 py-2 rounded-md border border-stone-200 dark:border-stone-600 text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {isUploading && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">Uploading {currentFile}…</span>
            <span className="text-sm font-medium text-gray-700">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
