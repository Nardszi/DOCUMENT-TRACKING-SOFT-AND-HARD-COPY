import { PDFDocument, rgb } from 'pdf-lib'

export interface PdfSignatureField {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  label: string
}

export async function signPdf(
  pdfArrayBuffer: ArrayBuffer,
  signatureImageBase64: string,
  fields: PdfSignatureField[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfArrayBuffer)
  const pngImage = await pdfDoc.embedPng(signatureImageBase64)

  for (const field of fields) {
    const page = pdfDoc.getPage(field.pageIndex)
    const { width: pgW, height: pgH } = page.getSize()

    const scaleX = field.width / pngImage.width
    const scaleY = field.height / pngImage.height
    const scale = Math.min(scaleX, scaleY, 1)

    const drawW = pngImage.width * scale
    const drawH = pngImage.height * scale

    const centerX = field.x + (field.width - drawW) / 2
    const centerY = (pgH - field.y) - drawH - (field.height - drawH) / 2

    page.drawImage(pngImage, {
      x: centerX,
      y: centerY,
      width: drawW,
      height: drawH,
    })

    if (field.label) {
      page.drawText(field.label, {
        x: field.x,
        y: pgH - field.y - field.height - 2,
        size: 8,
        color: rgb(0.4, 0.4, 0.4),
      })
    }
  }

  const form = pdfDoc.getForm()
  const formFields = form.getFields()
  for (const ff of formFields) {
    const t = ff.constructor.name
    if (t === 'PDFSignature' || t === 'SignatureField') {
      try { form.flatten() } catch {}
      break
    }
  }

  return pdfDoc.save()
}
