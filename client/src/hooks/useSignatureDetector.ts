import { useState, useCallback } from 'react'
import { PDFDocument } from 'pdf-lib'
import * as mammoth from 'mammoth'

const SIG_PATTERNS = [
  /signature\s*:?\s*/i,
  /signed\s+by\s*:?\s*/i,
  /sign\s+here\s*:?\s*/i,
  /approved\s+by\s*:?\s*/i,
  /_{4,}/,
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

function extractTextOperators(raw: string): string[] {
  const fragments: string[] = []
  const textLineRegex = /\(([^)]*?)\)\s*(?:Tj|'|")/g
  let match: RegExpExecArray | null
  while ((match = textLineRegex.exec(raw)) !== null) {
    fragments.push(match[1])
  }
  const hexRegex = /<([0-9A-Fa-f]+)>\s*Tj/g
  while ((match = hexRegex.exec(raw)) !== null) {
    try {
      const hex = match[1]
      const decoded = hex.match(/.{1,2}/g)
        ?.map((b) => String.fromCharCode(parseInt(b, 16)))
        .join('') || ''
      fragments.push(decoded)
    } catch { }
  }
  const arrayRegex = /\[(.*?)\]\s*TJ/g
  while ((match = arrayRegex.exec(raw)) !== null) {
    const inner = match[1]
    const parts = inner.match(/\(([^)]*?)\)/g) || []
    for (const p of parts) {
      fragments.push(p.slice(1, -1))
    }
  }
  return fragments
}

function findSeq(bytes: Uint8Array, seq: Uint8Array, from: number): number {
  for (let i = from; i <= bytes.length - seq.length; i++) {
    let ok = true
    for (let j = 0; j < seq.length; j++) {
      if (bytes[i + j] !== seq[j]) { ok = false; break }
    }
    if (ok) return i
  }
  return -1
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const fragments: string[] = []

  const fromRaw = extractTextOperators(text)
  fragments.push(...fromRaw)

  const flateKw = new TextEncoder().encode('FlateDecode')
  const streamKw = new TextEncoder().encode('stream')
  const endstreamKw = new TextEncoder().encode('endstream')

  let pos = 0
  while (pos < bytes.length) {
    const fdPos = findSeq(bytes, flateKw, pos)
    if (fdPos === -1) break
    const sPos = findSeq(bytes, streamKw, fdPos)
    if (sPos === -1) break

    let dataStart = sPos + 6
    while (dataStart < bytes.length && (bytes[dataStart] === 0x0a || bytes[dataStart] === 0x0d)) dataStart++

    const ePos = findSeq(bytes, endstreamKw, dataStart)
    if (ePos === -1) break

    let dataEnd = ePos
    while (dataEnd > dataStart && (bytes[dataEnd - 1] === 0x0a || bytes[dataEnd - 1] === 0x0d || bytes[dataEnd - 1] === 0x20)) dataEnd--

    const compressed = bytes.slice(dataStart, dataEnd)
    try {
      const ds = new DecompressionStream('deflate-raw')
      const writer = ds.writable.getWriter()
      await writer.write(compressed)
      await writer.close()
      const reader = ds.readable.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
      const result = new Uint8Array(totalLen)
      let off = 0
      for (const chunk of chunks) {
        result.set(chunk, off)
        off += chunk.length
      }
      const inflatedText = new TextDecoder('utf-8', { fatal: false }).decode(result)
      const inflatedFrags = extractTextOperators(inflatedText)
      fragments.push(...inflatedFrags)
    } catch { }

    pos = ePos + 9
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

      const buffer = await file.arrayBuffer()
      let fields: DetectedField[] = []

      if (isPdf) {
        // 1 — Text pattern detection on raw bytes + decompressed streams
        const rawText = await extractPdfText(buffer)
        const lines = rawText.split(/\n+/).filter(Boolean)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (line && isPatternLine(line)) {
            fields.push({
              pageIndex: 0,
              x: 50,
              y: 80 + i * 28,
              width: 300,
              height: 30,
              label: line.replace(/:\s*_{0,}$/, '').trim(),
            })
          }
        }

        // 2 — AcroForm signature field detection via pdf-lib
        try {
          const pdfDoc = await PDFDocument.load(buffer)
          const form = pdfDoc.getForm()
          const formFields = form.getFields()
          for (const ff of formFields) {
            const t = ff.constructor.name
            if (t === 'PDFSignature' || t === 'SignatureField') {
              const page = pdfDoc.getPage(0)
              const { height: pgH } = page.getSize()
              fields.push({
                pageIndex: 0,
                x: 100,
                y: pgH - 200,
                width: 200,
                height: 50,
                label: 'Signature',
              })
            }
          }
        } catch { }
      }

      if (isDocx) {
        const result = await mammoth.extractRawText({ arrayBuffer: buffer })
        const docxLines = result.value.split('\n')

        for (let i = 0; i < docxLines.length; i++) {
          const docxLine = docxLines[i].trim()
          if (docxLine && isPatternLine(docxLine)) {
            fields.push({
              pageIndex: 0,
              x: 0,
              y: i * 30,
              width: 300,
              height: 30,
              label: docxLine.replace(/:\s*_{0,}$/, '').trim(),
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
