import QRCode from 'qrcode'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'

/**
 * Generate a QR code data URL (PNG base64) encoding the document tracking URL.
 * @param {string} documentId - The document UUID
 * @returns {Promise<string>} data URL
 */
export async function generateQRCode(documentId) {
  const url = `${APP_URL}/documents/${documentId}`
  return QRCode.toDataURL(url)
}
