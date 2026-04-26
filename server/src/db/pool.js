import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        // Railway PostgreSQL requires SSL
        ssl: process.env.DATABASE_URL.includes('railway') || process.env.DB_SSL === 'true'
          ? { rejectUnauthorized: false }
          : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'noneco_docs',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
)

pool.on('error', (err) => {
  console.error('Unexpected pg pool error:', err)
})

export default pool
