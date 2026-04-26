import dotenv from 'dotenv'
dotenv.config()

import http from 'http'
import app from './app.js'
import { startDeadlineJob } from './jobs/deadline.job.js'
import { runMigrations } from './db/migrations/migrate.js'

const PORT = parseInt(process.env.PORT || '3000', 10)

async function start() {
  // Auto-run pending migrations on startup (safe in production)
  try {
    await runMigrations()
  } catch (err) {
    console.error('[startup] Migration failed — aborting:', err.message)
    process.exit(1)
  }

  const server = http.createServer(app)

  server.listen(PORT, () => {
    console.log(`NONECO DTS server running on port ${PORT}`)
    startDeadlineJob()
  })

  server.on('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })
}

start()
