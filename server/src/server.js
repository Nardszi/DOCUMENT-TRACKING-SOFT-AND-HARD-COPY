import dotenv from 'dotenv'
dotenv.config()

import http from 'http'
import app from './app.js'
import { startDeadlineJob } from './jobs/deadline.job.js'
import { runMigrations } from './db/migrations/migrate.js'

const PORT = parseInt(process.env.PORT || '3000', 10)

async function start() {
  // Start HTTP server first so Railway health check passes immediately
  const server = http.createServer(app)

  server.listen(PORT, () => {
    console.log(`NONECO DTS server running on port ${PORT}`)
  })

  server.on('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })

  // Run migrations after server is listening (non-blocking for health check)
  try {
    await runMigrations()
    console.log('[startup] Database ready.')
    startDeadlineJob()
  } catch (err) {
    console.error('[startup] Migration failed:', err.message)
    // Don't exit — server is still running, DB may connect later
  }
}

start()
