/**
 * SSE Manager — manages Server-Sent Events connections per user.
 * Maintains Map<userId, Set<Response>> of active connections.
 */

class SSEManager {
  constructor() {
    this.connections = new Map() // Map<userId, Set<Response>>
  }

  connect(userId, res) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set())
    }
    this.connections.get(userId).add(res)

    // Heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n')
      } catch {
        this.disconnect(userId, res)
        clearInterval(heartbeat)
      }
    }, 30000)

    // Clean up on close
    res.on('close', () => {
      this.disconnect(userId, res)
      clearInterval(heartbeat)
    })
  }

  disconnect(userId, res) {
    const userConns = this.connections.get(userId)
    if (userConns) {
      userConns.delete(res)
      if (userConns.size === 0) {
        this.connections.delete(userId)
      }
    }
  }

  push(userId, event) {
    const userConns = this.connections.get(userId)
    if (!userConns || userConns.size === 0) return
    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const res of userConns) {
      try {
        res.write(data)
      } catch {
        this.disconnect(userId, res)
      }
    }
  }

  broadcast(userIds, event) {
    for (const userId of userIds) {
      this.push(userId, event)
    }
  }
}

// Singleton
export const sseManager = new SSEManager()
