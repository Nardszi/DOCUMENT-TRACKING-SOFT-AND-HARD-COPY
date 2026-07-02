import { fileURLToPath } from 'url'
import path from 'path'
import { existsSync } from 'fs'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../server/.env')
if (existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

import app from '../server/src/app.js'

export default app
