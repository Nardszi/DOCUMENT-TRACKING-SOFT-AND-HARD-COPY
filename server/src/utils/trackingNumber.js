/**
 * Generates the next tracking number for today using a PostgreSQL-backed
 * daily sequence. Must be called within an existing transaction (client).
 *
 * Format: NONECO-YYYYMMDD-XXXXX  (e.g. NONECO-20250115-00042)
 *
 * @param {import('pg').PoolClient} client - Active pg client (in transaction)
 * @returns {Promise<string>} The generated tracking number
 */
export async function generateTrackingNumber(client) {
  const now = new Date()
  const dateKey =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')

  const { rows } = await client.query(
    `INSERT INTO tracking_number_sequences (date_key, last_seq)
     VALUES ($1, 1)
     ON CONFLICT (date_key) DO UPDATE
       SET last_seq = tracking_number_sequences.last_seq + 1
     RETURNING last_seq`,
    [dateKey]
  )

  const seq = rows[0].last_seq
  return `NONECO-${dateKey}-${String(seq).padStart(5, '0')}`
}
