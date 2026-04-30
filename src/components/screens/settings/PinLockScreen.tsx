'use client'

import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '@/lib/db'
import {
  isWebAuthnSupported,
  registerBiometricCredential,
} from '@/lib/biometric'
import { hashPin, isValidPin, verifyPin } from '@/lib/pin'

interface Props {
  onBack: () => void
}

export default function PinLockScreen({ onBack }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [pinHash, setPinHash] = useState<string | null>(null)
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [biometricCredentialId, setBiometricCredentialId] = useState<string | null>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSettings = async () => {
    const [storedEnabled, storedHash, storedBiometricEnabled, storedCredentialId] = await Promise.all([
      getSetting('pinEnabled'),
      getSetting('pinHash'),
      getSetting('biometricEnabled'),
      getSetting('biometricCredentialId'),
    ])
    setEnabled(storedEnabled ?? false)
    setPinHash(storedHash ?? null)
    setBiometricEnabled(storedBiometricEnabled ?? false)
    setBiometricCredentialId(storedCredentialId ?? null)
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const clearInputs = () => {
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
  }

  const savePin = async () => {
    setMessage(null)
    if (!isValidPin(newPin)) {
      setMessage('Use a 4-6 digit PIN.')
      return
    }
    if (newPin !== confirmPin) {
      setMessage('PIN confirmation does not match.')
      return
    }
    if (enabled && pinHash && !(await verifyPin(currentPin, pinHash))) {
      setMessage('Current PIN is incorrect.')
      return
    }

    setSaving(true)
    const nextHash = await hashPin(newPin)
    await Promise.all([
      setSetting('pinEnabled', true),
      setSetting('pinHash', nextHash),
    ])
    setEnabled(true)
    setPinHash(nextHash)
    clearInputs()
    setMessage(enabled ? 'PIN changed.' : 'PIN lock enabled.')
    setSaving(false)
  }

  const disablePin = async () => {
    setMessage(null)
    if (pinHash && !(await verifyPin(currentPin, pinHash))) {
      setMessage('Current PIN is incorrect.')
      return
    }
    setSaving(true)
    await Promise.all([
      setSetting('pinEnabled', false),
      setSetting('pinHash', null),
      setSetting('biometricEnabled', false),
      setSetting('biometricCredentialId', null),
    ])
    setEnabled(false)
    setPinHash(null)
    setBiometricEnabled(false)
    setBiometricCredentialId(null)
    clearInputs()
    setMessage('PIN lock disabled.')
    setSaving(false)
  }

  const enableBiometric = async () => {
    setMessage(null)
    if (!enabled || !pinHash) {
      setMessage('Enable PIN lock before device unlock.')
      return
    }
    if (!(await verifyPin(currentPin, pinHash))) {
      setMessage('Current PIN is incorrect.')
      return
    }
    setSaving(true)
    try {
      const credentialId = await registerBiometricCredential()
      await Promise.all([
        setSetting('biometricEnabled', true),
        setSetting('biometricCredentialId', credentialId),
      ])
      setBiometricEnabled(true)
      setBiometricCredentialId(credentialId)
      setMessage('Device unlock enabled.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Device unlock setup failed.')
    } finally {
      setSaving(false)
    }
  }

  const disableBiometric = async () => {
    setSaving(true)
    await Promise.all([
      setSetting('biometricEnabled', false),
      setSetting('biometricCredentialId', null),
    ])
    setBiometricEnabled(false)
    setBiometricCredentialId(null)
    setMessage('Device unlock disabled.')
    setSaving(false)
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-indigo-500 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">PIN lock</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-9">
          {enabled ? 'Enabled' : 'Off'}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-3">
          {enabled && (
            <PinInput label="Current PIN" value={currentPin} onChange={setCurrentPin} />
          )}
          <PinInput label={enabled ? 'New PIN' : 'Set PIN'} value={newPin} onChange={setNewPin} />
          <PinInput label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} />

          {message && (
            <p className={`text-xs ${message.includes('incorrect') || message.includes('match') || message.includes('Use') ? 'text-red-500' : 'text-green-600'}`}>
              {message}
            </p>
          )}

          <button
            onClick={savePin}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : enabled ? 'Change PIN' : 'Enable PIN lock'}
          </button>

          {enabled && (
            <button
              onClick={disablePin}
              disabled={saving || !currentPin}
              className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-semibold disabled:opacity-50"
            >
              Disable PIN lock
            </button>
          )}
        </div>

        {enabled && (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Device unlock</p>
              <p className="text-xs text-gray-400 mt-1">
                {isWebAuthnSupported()
                  ? biometricEnabled && biometricCredentialId
                    ? 'Enabled on this browser.'
                    : 'Use your phone unlock when supported.'
                  : 'Not supported in this browser.'}
              </p>
            </div>
            {isWebAuthnSupported() && (
              biometricEnabled ? (
                <button
                  onClick={disableBiometric}
                  disabled={saving}
                  className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-semibold disabled:opacity-50"
                >
                  Disable Device Unlock
                </button>
              ) : (
                <button
                  onClick={enableBiometric}
                  disabled={saving || !currentPin}
                  className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Enable Device Unlock
                </button>
              )
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center px-5">
          Your PIN is hashed on this device. There is no recovery flow, so disabling or changing it
          requires the current PIN.
        </p>
      </div>
    </div>
  )
}

function PinInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        type="password"
        placeholder="4-6 digits"
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  )
}
