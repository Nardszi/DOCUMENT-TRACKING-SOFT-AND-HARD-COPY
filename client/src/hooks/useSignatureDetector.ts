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
        const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist')
        GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@5/build/pdf.worker.min.mjs`

        const buffer = await file.arrayBuffer()
        const pdf = await getDocument({ data: buffer }).promise

        for (let p = 0; p < pdf.numPages; p++) {
          const page = await pdf.getPage(p + 1)
          const textContent = await page.getTextContent()
          const viewport = page.getViewport({ scale: 1 })

          let prevY: number | null = null
          let lineText = ''

          for (const item of textContent.items) {
            if ('str' in item) {
              const y = Math.round(item.transform[5])
              if (prevY !== null && Math.abs(y - prevY) > 8) {
                if (isPatternLine(lineText)) {
                  fields.push({
                    pageIndex: p,
                    x: 0,
                    y: y,
                    width: viewport.width * 0.35,
                    height: 30,
                    label: lineText.trim().replace(/:$/, ''),
                  })
                }
                lineText = ''
              }
              lineText += item.str + ' '
              prevY = y
            }
          }

          if (lineText && isPatternLine(lineText)) {
            fields.push({
              pageIndex: p,
              x: 0,
              y: prevY ?? 0,
              width: viewport.width * 0.35,
              height: 30,
              label: lineText.trim().replace(/:$/, ''),
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
