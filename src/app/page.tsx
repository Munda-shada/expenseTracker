'use client'

import { useEffect, useRef, useState } from 'react'
import Onboarding from '@/components/Onboarding'
import AppShell from '@/components/AppShell'
import PinUnlockScreen from '@/components/PinUnlockScreen'
import { checkDailyReminder, checkPowerNotifications } from '@/lib/reminders'
import { checkWeeklyEmailBackup } from '@/lib/emailBackup'
import { registerServiceWorker } from '@/lib/serviceWorker'

type AppState = 'loading' | 'onboarding' | 'home'

export default function Home() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [pinHash, setPinHash] = useState<string | null>(null)
  const [biometricCredentialId, setBiometricCredentialId] = useState<string | null>(null)
  const [pinUnlocked, setPinUnlocked] = useState(false)
  const hiddenAtRef = useRef<number | null>(null)
  const [focusLogInput, setFocusLogInput] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URL(window.location.href).searchParams.get('focusLog') === '1'
  })

  useEffect(() => {
    import('@/lib/db').then(({ getDB, getSetting }) => {
      getDB().then(async () => {
        const [
          completed,
          pinEnabled,
          storedPinHash,
          biometricEnabled,
          storedBiometricCredentialId,
        ] = await Promise.all([
          getSetting('firstLaunchCompleted'),
          getSetting('pinEnabled'),
          getSetting('pinHash'),
          getSetting('biometricEnabled'),
          getSetting('biometricCredentialId'),
        ])
        setPinHash(pinEnabled && storedPinHash ? storedPinHash : null)
        setBiometricCredentialId(
          biometricEnabled && storedBiometricCredentialId ? storedBiometricCredentialId : null
        )
        setPinUnlocked(!(pinEnabled && storedPinHash))
        setAppState(completed ? 'home' : 'onboarding')
      }).catch((e: Error) => console.error(e))
    })
    registerServiceWorker()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const shouldFocusLog = url.searchParams.get('focusLog') === '1'
    if (!shouldFocusLog) return
    url.searchParams.delete('focusLog')
    window.history.replaceState({}, '', url.toString())
  }, [])

  useEffect(() => {
    if (appState !== 'home') return

    const checkScheduledWork = () => {
      checkDailyReminder()
      checkPowerNotifications().catch((e: Error) => console.error(e))
      checkWeeklyEmailBackup().catch((e: Error) => console.error(e))
    }

    checkScheduledWork()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkScheduledWork()
    }
    const interval = window.setInterval(() => checkDailyReminder(), 60_000)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', checkScheduledWork)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', checkScheduledWork)
    }
  }, [appState])

  useEffect(() => {
    if (!pinHash || !pinUnlocked) return

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }
      if (
        document.visibilityState === 'visible' &&
        hiddenAtRef.current &&
        Date.now() - hiddenAtRef.current > 5 * 60 * 1000
      ) {
        setPinUnlocked(false)
      }
      hiddenAtRef.current = null
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [pinHash, pinUnlocked])

  if (appState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">💸</span>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (appState === 'onboarding') {
    return <Onboarding onComplete={() => setAppState('home')} />
  }

  if (pinHash && !pinUnlocked) {
    return (
      <PinUnlockScreen
        pinHash={pinHash}
        biometricCredentialId={biometricCredentialId}
        onUnlock={() => setPinUnlocked(true)}
      />
    )
  }

  return <AppShell focusLogInput={focusLogInput} onLogInputFocused={() => setFocusLogInput(false)} />
}
