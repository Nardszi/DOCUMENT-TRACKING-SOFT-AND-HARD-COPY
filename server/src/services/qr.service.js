import QRCode from 'qrcode'

const APP_URL = process.env.APP_URL || 'http://localhost:5173'

/**
 * Generate a QR code data URL (PNG base64) encoding the document tracking URL.
 * @param {string} trackingNumber
 * @returns {Promise<string>} data URL
 */
export async function generateQRCode(trackingNumber) {
  const url = `${APP_URL}/documents/${trackingNumber}`
  return QRCode.toDataURL(url)
}
