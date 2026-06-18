const TOKEN_KEY = 'noneco_token'

export async function api(url: string, options: RequestInit = {}, retries = 1): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  let lastError: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers })

      // If 401, try to refresh the token once
      if (res.status === 401 && token) {
        const refreshRes = await fetch('/api/auth/refresh', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (refreshRes.ok) {
          const data = await refreshRes.json()
          localStorage.setItem(TOKEN_KEY, data.token)
          headers['Authorization'] = `Bearer ${data.token}`
          const retryRes = await fetch(url, { ...options, headers })
          return retryRes
        }
        // Refresh failed — clear token
        localStorage.removeItem(TOKEN_KEY)
        window.dispatchEvent(new CustomEvent('auth:logout'))
        return res
      }

      return res
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError || new Error('Request failed')
}
