import dotenv from 'dotenv'
dotenv.config()

import http from 'http'
import app from './app.js'
import { startDeadlineJob } from './jobs/deadline.job.js'

const PORT = parseInt(process.env.PORT || '3000', 10)

const server = http.createServer(app)

server.listen(PORT, () => {
  console.log(`NONECO DTS server running on port ${PORT}`)
  startDeadlineJob()
})

server.on('error', (err) => {
  console.error('Server error:', err)
  process.exit(1)
})

export default server
