/**
 * Smoke test: verifies pool module exports a pg Pool instance.
 * Does NOT require a live database connection.
 */
import { describe, it, expect } from 'vitest'

describe('db/pool', () => {
  it('exports a pool object with a query method', async () => {
    // Dynamically import so env vars can be set before import
    const { default: pool } = await import('./pool.js')
    expect(pool).toBeDefined()
    expect(typeof pool.query).toBe('function')
    expect(typeof pool.connect).toBe('function')
    // Clean up — end the pool so the test process can exit
    await pool.end()
  })
})
