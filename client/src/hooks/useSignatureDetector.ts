import { useState, useCallback } from 'react'

const SIG_PATTERNS = [
  /signature\s*:?\s*/i,
  /signed\s+by\s*:?\s*/i,
  /sign\s+here\s*:?\s*/i,
  /approved\s+by\s*:?\s*/i,
]

export interface DetectedField {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  label: string
}

export interface DetectionResult {
  fields: DetectedField[]
  fieldCount: number
  fileType: 'pdf' | 'docx' | null
  error: string | null
}

interface State {
  detecting: boolean
  fields: DetectedField[]
  fieldCount: number
  fileType: 'pdf' | 'docx' | null
  error: string | null
}

function isPatternLine(text: string): boolean {
  return SIG_PATTERNS.some((p) => p.test(text))
}

function extractPdfText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const fragments: string[] = []

  const textLineRegex = /\(([^)]*?)\)\s*(?:Tj|'|")/g
  let match: RegExpExecArray | null
  while ((match = textLineRegex.exec(text)) !== null) {
    fragments.push(match[1])
  }

  const hexRegex = /<([0-9A-Fa-f]+)>\s*Tj/g
  while ((match = hexRegex.exec(text)) !== null) {
    try {
      const hex = match[1]
      const decoded = hex.match(/.{1,2}/g)
        ?.map((b) => String.fromCharCode(parseInt(b, 16)))
        .join('') || ''
      fragments.push(decoded)
    } catch { }
  }

  const arrayRegex = /\[(.*?)\]\s*TJ/g
  while ((match = arrayRegex.exec(text)) !== null) {
    const inner = match[1]
    const parts = inner.match(/\(([^)]*?)\)/g) || []
    for (const p of parts) {
      fragments.push(p.slice(1, -1))
    }
  }

  return fragments.join(' ')
}

export function useSignatureDetector() {
  const [state, setState] = useState<State>({
    detecting: false,
    fields: [],
    fieldCount: 0,
    fileType: null,
    error: null,
  })

  const detect = useCallback(async (file: File): Promise<DetectionResult> => {
    setState((s) => ({ ...s, detecting: true, error: null, fields: [], fieldCount: 0 }))

    try {
      const isPdf = file.type === 'application/pdf'
      const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

      if (!isPdf && !isDocx) {
        const err = 'Unsupported file type. Only PDF and Word documents are supported.'
        setState((s) => ({ ...s, detecting: false, error: err }))
        return { fields: [], fieldCount: 0, fileType: null, error: err }
      }

      let fields: DetectedField[] = []

      if (isPdf) {
        const buffer = await file.arrayBuffer()
        const rawText = extractPdfText(buffer)
        const lines = rawText.split(/\n+/).filter(Boolean)

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (line && isPatternLine(line)) {
            fields.push({
              pageIndex: 0,
              x: 0,
              y: i * 28,
              width: 300,
              height: 30,
              label: line.replace(/:$/, ''),
            })
          }
        }
      }

      if (isDocx) {
        const mammoth = await import('mammoth')
        const buffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer: buffer })
        const lines = result.value.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (line && isPatternLine(line)) {
            fields.push({
              pageIndex: 0,
              x: 0,
              y: i * 30,
              width: 300,
              height: 30,
              label: line.replace(/:$/, ''),
            })
          }
        }
      }

      setState({
        detecting: false,
        fields,
        fieldCount: fields.length,
        fileType: isPdf ? 'pdf' : 'docx',
        error: null,
      })

      return { fields, fieldCount: fields.length, fileType: isPdf ? 'pdf' : 'docx', error: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to detect signature fields.'
      setState((s) => ({ ...s, detecting: false, error: msg }))
      return { fields: [], fieldCount: 0, fileType: null, error: msg }
    }
  }, [])

  const reset = useCallback(() => {
    setState({ detecting: false, fields: [], fieldCount: 0, fileType: null, error: null })
  }, [])

  return { ...state, detect, reset }
}
