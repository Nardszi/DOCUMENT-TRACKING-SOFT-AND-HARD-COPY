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
// SupabaseStorageAdapter — persistent cloud storage for Vercel deployment
// ---------------------------------------------------------------------------
class SupabaseStorageAdapter {
  constructor() {
    const url = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      throw new Error('SupabaseStorageAdapter requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars')
    }
    // Lazy import to avoid adding @supabase/supabase-js to bundle when not used
    this._clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      return createClient(url, serviceKey, { auth: { persistSession: false } })
    })
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'attachments'
  }

  async _getClient() {
    return this._clientPromise
  }

  /**
   * Upload a buffer to Supabase Storage.
   * Stores at {bucket}/{year}/{month}/{uuid}.{ext}
   * @param {Buffer} buffer
   * @param {string} originalName
   * @param {string} mimeType
   * @returns {Promise<string>} storage path (year/month/uuid.ext)
   */
  async save(buffer, originalName, mimeType) {
    const client = await this._getClient()
    const now = new Date()
    const year = now.getFullYear().toString()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const ext = path.extname(originalName).toLowerCase() || ''
    const storagePath = `${year}/${month}/${uuidv4()}${ext}`

    const { error } = await client.storage
      .from(this.bucket)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false })

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`)
    }

    return storagePath
  }

  /**
   * Download a file from Supabase Storage as a Buffer.
   * @param {string} storagePath
   * @returns {Promise<Buffer>}
   */
  async get(storagePath) {
    const client = await this._getClient()
    const { data, error } = await client.storage.from(this.bucket).download(storagePath)
    if (error) throw new Error(`Supabase download failed: ${error.message}`)
    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  /**
   * Delete a file from Supabase Storage.
   * @param {string} storagePath
   * @returns {Promise<void>}
   */
  async delete(storagePath) {
    const client = await this._getClient()
    const { error } = await client.storage.from(this.bucket).remove([storagePath])
    if (error) throw new Error(`Supabase delete failed: ${error.message}`)
  }

  /**
   * Get a signed URL for the file (valid for 1 hour).
   * @param {string} storagePath
   * @returns {Promise<string>} signed URL
   */
  async getSignedUrl(storagePath) {
    const client = await this._getClient()
    const { data, error } = await client.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, 3600)
    if (error) throw new Error(`Supabase signed URL failed: ${error.message}`)
    return data.signedUrl
  }

  /**
   * Get a public URL (if bucket is public).
   * @param {string} storagePath
   * @returns {string} public URL
   */
  getPublicUrl(storagePath) {
    // Note: this is synchronous and requires the bucket to be public
    // For private buckets, use getSignedUrl() instead
    return `https://${process.env.SUPABASE_URL.replace('https://', '')}/storage/v1/object/public/${this.bucket}/${storagePath}`
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _adapter = null

/**
 * Returns the configured storage adapter (singleton).
 * Controlled by STORAGE_BACKEND env var: 'local' (default) | 'minio' | 'supabase'
 * @returns {LocalStorageAdapter | MinIOStorageAdapter | SupabaseStorageAdapter}
 */
export function getStorageAdapter() {
  if (_adapter) return _adapter

  const backend = (process.env.STORAGE_BACKEND || 'local').toLowerCase()

  if (backend === 'supabase') {
    console.info('[storage] Using Supabase Storage backend')
    _adapter = new SupabaseStorageAdapter()
  } else if (backend === 'minio') {
    console.info('[storage] Using MinIO storage backend')
    _adapter = new MinIOStorageAdapter()
  } else {
    const uploadsDir = process.env.UPLOADS_DIR || './uploads'
    console.info(`[storage] Using local storage backend at ${uploadsDir}`)
    _adapter = new LocalStorageAdapter(uploadsDir)
  }

  return _adapter
}
