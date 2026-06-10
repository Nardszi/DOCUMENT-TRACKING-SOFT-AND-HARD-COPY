import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { Pool } = pg

// Prefer Vercel Supabase integration vars (POSTGRES_URL family), then DATABASE_URL, then individual parts
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: /railway|supabase|sslmode=require/i.test(connectionString) || process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'noneco_docs',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    })

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err)
})

export default pool
