import fs from 'fs'
import path from 'path'
import { createReadStream } from 'fs'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// LocalStorageAdapter
// ---------------------------------------------------------------------------
class LocalStorageAdapter {
  constructor(baseDir = './uploads') {
    this.baseDir = baseDir
  }

  /**
   * Save a file buffer to disk.
   * Stores at {baseDir}/{year}/{month}/{uuid}.{ext}
   * @param {Buffer} buffer
   * @param {string} originalName
   * @param {string} _mimeType
   * @returns {Promise<string>} portable storage path (year/month/uuid.ext)
   */
  async save(buffer, originalName, _mimeType) {
    const now = new Date()
    const year = now.getFullYear().toString()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const ext = path.extname(originalName).toLowerCase() || ''
    const filename = `${uuidv4()}${ext}`

    const dirPath = path.join(this.baseDir, year, month)
    await fs.promises.mkdir(dirPath, { recursive: true })

    const filePath = path.join(dirPath, filename)
    await fs.promises.writeFile(filePath, buffer)

    return `${year}/${month}/${filename}`
  }

  /**
   * Read a file into a Buffer.
   * @param {string} storagePath
   * @returns {Promise<Buffer>}
   */
  async get(storagePath) {
    const filePath = path.join(this.baseDir, storagePath)
    return fs.promises.readFile(filePath)
  }

  /**
   * Delete a file.
   * @param {string} storagePath
   * @returns {Promise<void>}
   */
  async delete(storagePath) {
    const filePath = path.join(this.baseDir, storagePath)
    await fs.promises.unlink(filePath)
  }

  /**
   * Return a readable stream for the file.
   * @param {string} storagePath
   * @returns {import('fs').ReadStream}
   */
  getStream(storagePath) {
    const filePath = path.join(this.baseDir, storagePath)
    return createReadStream(filePath)
  }
}

// ---------------------------------------------------------------------------
// MinIOStorageAdapter (stub — logs warning and throws if minio not installed)
// ---------------------------------------------------------------------------
class MinIOStorageAdapter {
  constructor() {
    this.client = null
    this.bucket = process.env.MINIO_BUCKET || 'noneco-docs'
    // Attempt to load minio synchronously via dynamic import at first use
    this._ready = this._init()
  }

  async _init() {
    try {
      const minio = await import('minio')
      this.client = new minio.Client({
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT || '9000', 10),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY || '',
        secretKey: process.env.MINIO_SECRET_KEY || '',
      })
    } catch {
      console.warn('[storage] minio package not available — MinIOStorageAdapter will throw on use')
    }
  }

  async _assertClient() {
    await this._ready
    if (!this.client) {
      throw new Error('MinIO not configured: install the minio package and set MINIO_* env vars')
    }
  }

  async save(buffer, originalName, _mimeType) {
    await this._assertClient()
    const now = new Date()
    const year = now.getFullYear().toString()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const ext = path.extname(originalName).toLowerCase() || ''
    const objectName = `${year}/${month}/${uuidv4()}${ext}`
    await this.client.putObject(this.bucket, objectName, buffer)
    return objectName
  }

  async get(storagePath) {
    await this._assertClient()
    return new Promise((resolve, reject) => {
      const chunks = []
      this.client.getObject(this.bucket, storagePath, (err, stream) => {
        if (err) return reject(err)
        stream.on('data', (chunk) => chunks.push(chunk))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })
    })
  }

  async delete(storagePath) {
    await this._assertClient()
    await this.client.removeObject(this.bucket, storagePath)
  }

  async getStream(storagePath) {
    await this._assertClient()
    const { PassThrough } = await import('stream')
    const pass = new PassThrough()
    this.client.getObject(this.bucket, storagePath, (err, stream) => {
      if (err) { pass.destroy(err); return }
      stream.pipe(pass)
    })
    return pass
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _adapter = null

/**
 * Returns the configured storage adapter (singleton).
 * Controlled by STORAGE_BACKEND env var: 'local' (default) | 'minio'
 * @returns {LocalStorageAdapter | MinIOStorageAdapter}
 */
export function getStorageAdapter() {
  if (_adapter) return _adapter

  const backend = (process.env.STORAGE_BACKEND || 'local').toLowerCase()

  if (backend === 'minio') {
    console.info('[storage] Using MinIO storage backend')
    _adapter = new MinIOStorageAdapter()
  } else {
    const uploadsDir = process.env.UPLOADS_DIR || './uploads'
    console.info(`[storage] Using local storage backend at ${uploadsDir}`)
    _adapter = new LocalStorageAdapter(uploadsDir)
  }

  return _adapter
}
