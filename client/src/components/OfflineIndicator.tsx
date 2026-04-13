import { useState, useEffect } from 'react'

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}
      className="bg-amber-400 text-amber-900 text-center text-sm font-medium py-2 px-4 w-full"
      role="alert"
    >
      You are offline. Some features may be unavailable.
    </div>
  )
}
