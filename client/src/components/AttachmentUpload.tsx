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

export default function AttachmentUpload({ documentId, token, disabled, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
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
    const file = files[0]
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setSelectedFile(null)
      return
    }
    setError(null)
    setSelectedFile(file)
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
    // reset so same file can be re-selected after clearing
    e.target.value = ''
  }

  function handleUpload() {
    if (!selectedFile) return
    setError(null)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', selectedFile)

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      setProgress(null)
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          const attachment: Attachment = JSON.parse(xhr.responseText)
          setSelectedFile(null)
          onUploaded(attachment)
        } catch {
          setError('Upload succeeded but response was unexpected.')
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText)
          const code = body?.error?.code
          if (code === 'FILE_TYPE_INVALID') {
            setError('Invalid file type. Allowed: PDF, DOCX, XLSX, PNG, JPG.')
          } else if (code === 'FILE_TOO_LARGE') {
            setError('File is too large. Maximum size is 20 MB.')
          } else if (code === 'DOCUMENT_COMPLETED') {
            setError('Attachments cannot be added to completed documents.')
          } else {
            setError(body?.error?.message ?? 'Upload failed. Please try again.')
          }
        } catch {
          setError('Upload failed. Please try again.')
        }
      }
    })

    xhr.addEventListener('error', () => {
      setProgress(null)
      setError('Network error. Please check your connection and try again.')
    })

    xhr.open('POST', `/api/documents/${documentId}/attachments`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  }

  function handleClear() {
    setSelectedFile(null)
    setError(null)
    setProgress(null)
  }

  const isUploading = progress !== null

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
          Drag &amp; drop a file here, or{' '}
          <span className="text-blue-600 font-medium underline">browse files</span>
        </p>
        <p className="text-sm text-gray-400 mt-1">PDF, DOCX, XLSX, PNG, JPG — max 20 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleInputChange}
      />

      {/* Selected file + upload button */}
      {selectedFile && !isUploading && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span className="text-base text-gray-700 truncate max-w-xs" title={selectedFile.name}>
            {selectedFile.name}
          </span>
          <button
            type="button"
            onClick={handleUpload}
            className="min-h-[44px] px-4 py-2 rounded-md bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Upload
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[44px] px-3 py-2 rounded-md border border-gray-300 bg-white text-base font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Progress bar */}
      {isUploading && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">Uploading {selectedFile?.name}…</span>
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
