import JSZip from 'jszip'

export interface DocxSignatureField {
  paragraphIndex: number
  rawText: string
}

const SIGNATURE_PATTERNS = [
  /signature\s*:?\s*/i,
  /signed\s+by\s*:?\s*/i,
  /sign\s+here\s*:?\s*/i,
  /approved\s+by\s*:?\s*/i,
  /_+/,
]

export function detectDocxPlaceholders(text: string): DocxSignatureField[] {
  const fields: DocxSignatureField[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const matched = SIGNATURE_PATTERNS.some((p) => p.test(line))
    if (matched) {
      fields.push({ paragraphIndex: i, rawText: line })
    }
  }
  return fields
}

export async function signDocx(
  docxArrayBuffer: ArrayBuffer,
  signerName: string,
  fields: DocxSignatureField[]
): Promise<Blob> {
  const zip = await JSZip.loadAsync(docxArrayBuffer)

  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) throw new Error('Cannot find word/document.xml in the DOCX archive.')

  let xmlContent = await docXmlFile.async('string')

  for (const field of fields) {
    const escaped = field.rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(escaped.replace(/_+/g, '\\s*_{2,}\\s*'), 'g')
    const replacement = field.rawText.replace(/_+/g, ` ${signerName} `)
    xmlContent = xmlContent.replace(pattern, replacement)
  }

  zip.file('word/document.xml', xmlContent)
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  return blob
}
