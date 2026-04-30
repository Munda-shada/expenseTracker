'use client'

import { useState } from 'react'
import { isWebAuthnSupported, verifyBiometricCredential } from '@/lib/biometric'
import { verifyPin } from '@/lib/pin'

interface Props {
  pinHash: string
  biometricCredentialId?: string | null
  onUnlock: () => void
}

export default function PinUnlockScreen({ pinHash, biometricCredentialId, onUnlock }: Props) {
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [biometricLoading, setBiometricLoading] = useState(false)

  const blocked = cooldownUntil > 0
  const canUseBiometric = !!biometricCredentialId && isWebAuthnSupported()

  const handleBiometricUnlock = async () => {
    if (!biometricCredentialId) return
    setBiometricLoading(true)
    const ok = await verifyBiometricCredential(biometricCredentialId)
    setBiometricLoading(false)
    if (ok) {
      onUnlock()
      return
    }
    setError('Device unlock failed. Use your PIN instead.')
  }

  const handleUnlock = async () => {
    if (blocked) return
    if (!pin.trim()) return

    const ok = await verifyPin(pin, pinHash)
    if (ok) {
      setPin('')
      setAttempts(0)
      onUnlock()
      return
    }

    const nextAttempts = attempts + 1
    setAttempts(nextAttempts)
    setPin('')
    if (nextAttempts >= 5) {
      setCooldownUntil(Date.now() + 30_000)
      setAttempts(0)
      setError('Too many attempts. Try again in 30 seconds.')
      window.setTimeout(() => {
        setCooldownUntil(0)
        setError(null)
      }, 30_000)
      return
    }
    setError(`Wrong PIN. ${5 - nextAttempts} attempts left.`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm px-5 py-6">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-xl font-bold text-gray-800">Enter PIN</h1>
          <p className="text-xs text-gray-400 mt-1">Expense Tracker is locked</p>
        </div>

        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUnlock()
          }}
          inputMode="numeric"
          type="password"
          autoFocus
          disabled={blocked}
          placeholder="4-6 digit PIN"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-lg tracking-[0.4em] text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
        />

        {error && (
          <p className="text-xs text-red-500 text-center mt-3">{error}</p>
        )}

        {canUseBiometric && (
          <button
            onClick={handleBiometricUnlock}
            disabled={biometricLoading}
            className="w-full mt-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {biometricLoading ? 'Checking...' : 'Use device unlock'}
          </button>
        )}

        <button
          onClick={handleUnlock}
          disabled={blocked || pin.length < 4}
          className="w-full mt-3 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40"
        >
          Unlock
        </button>
      </div>
    </div>
  )
}
