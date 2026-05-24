import { useState, useRef, useCallback } from 'react'
import SignatureCanvas from 'react-signature-canvas'

interface Props {
  onSave: (signatureDataUrl: string) => void
  onClose: () => void
}

export default function SignatureModal({ onSave, onClose }: Props) {
  const sigRef = useRef<SignatureCanvas>(null)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [typedName, setTypedName] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  const handleClear = useCallback(() => {
    sigRef.current?.clear()
    setPreview(null)
  }, [])

  const handlePreview = useCallback(() => {
    if (mode === 'draw') {
      if (sigRef.current?.isEmpty()) return
      const data = sigRef.current?.toDataURL('image/png')
      if (data) setPreview(data)
    } else {
      if (!typedName.trim()) return
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 120
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = 'transparent'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#111111'
      ctx.font = '48px "Brush Script MT", "Great Vibes", "Pacifico", cursive'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText(typedName.trim(), canvas.width / 2, canvas.height / 2)
      setPreview(canvas.toDataURL('image/png'))
    }
  }, [mode, typedName])

  const handleConfirm = useCallback(() => {
    if (!preview) return
    onSave(preview)
  }, [preview, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sig-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700 shadow-2xl overflow-hidden animate-slide-up">
        <div className="bg-amber-600 px-6 py-4">
          <h2 id="sig-modal-title" className="text-base font-bold text-white">Sign Document</h2>
          <p className="text-xs text-amber-200 mt-0.5">Draw or type your signature</p>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-stone-200 dark:border-stone-700">
          <button
            type="button"
            onClick={() => { setMode('draw'); setPreview(null) }}
            className={`flex-1 min-h-[44px] text-sm font-semibold transition-colors ${
              mode === 'draw'
                ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50/50 dark:text-amber-400 dark:border-amber-400 dark:bg-amber-900/10'
                : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => { setMode('type'); setPreview(null) }}
            className={`flex-1 min-h-[44px] text-sm font-semibold transition-colors ${
              mode === 'type'
                ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50/50 dark:text-amber-400 dark:border-amber-400 dark:bg-amber-900/10'
                : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            Type
          </button>
        </div>

        <div className="p-6 space-y-4">
          {mode === 'draw' ? (
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 dark:text-stone-400">
                Draw your signature below
              </p>
              <div className="border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-xl bg-white overflow-hidden">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#111111"
                  canvasProps={{
                    className: 'w-full h-32',
                    width: 400,
                    height: 128,
                  }}
                  clearOnResize={false}
                />
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="mt-2 text-xs text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 underline"
              >
                Clear
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 dark:text-stone-400">
                Type your full name
              </p>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Juan Dela Cruz"
                className="w-full min-h-[44px] rounded-xl border border-stone-200 px-3.5 py-2.5 text-lg bg-stone-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 dark:bg-stone-700 dark:text-stone-100 dark:border-stone-600 transition-all"
              />
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="rounded-xl border border-stone-200 dark:border-stone-600 p-4 bg-stone-50 dark:bg-stone-700/50">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 dark:text-stone-400">Preview</p>
              <img src={preview} alt="Signature preview" className="max-h-20 object-contain" />
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2.5 pt-2 border-t border-stone-100 dark:border-stone-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreview}
              className="flex-1 min-h-[40px] px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-medium text-amber-800 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30 transition-all"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!preview}
              className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Use Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
