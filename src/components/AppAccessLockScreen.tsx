'use client'

import { useState } from 'react'

interface Props {
  configured: boolean
  onUnlock: () => void
}

export default function AppAccessLockScreen({ configured, onUnlock }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleUnlock = async () => {
    if (!configured || !code.trim() || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!res.ok) {
        setError('Invalid code')
        return
      }

      setCode('')
      onUnlock()
    } catch {
      setError('Could not unlock. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm px-5 py-6">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🔐</div>
          <h1 className="text-xl font-bold text-gray-800">Enter access code</h1>
          <p className="text-xs text-gray-400 mt-1">
            Expense Tracker is private
          </p>
        </div>

        {!configured && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            APP_ACCESS_CODE is not configured on the server.
          </p>
        )}

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUnlock()
          }}
          type="password"
          autoFocus={configured}
          disabled={!configured || loading}
          placeholder="Secret code"
          className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
        />

        {error && (
          <p className="text-xs text-red-500 text-center mt-3">{error}</p>
        )}

        <button
          onClick={handleUnlock}
          disabled={!configured || loading || !code.trim()}
          className="w-full mt-3 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40"
        >
          {loading ? 'Unlocking...' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}
