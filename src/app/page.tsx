'use client'

import { useEffect, useRef, useState } from 'react'
import Onboarding from '@/components/Onboarding'
import AppShell from '@/components/AppShell'
import AppAccessLockScreen from '@/components/AppAccessLockScreen'
import PinUnlockScreen from '@/components/PinUnlockScreen'
import { checkDailyReminder, checkPowerNotifications } from '@/lib/reminders'
import { checkWeeklyEmailBackup } from '@/lib/emailBackup'
import { registerServiceWorker } from '@/lib/serviceWorker'

type AppState = 'loading' | 'onboarding' | 'home'
type AccessState = 'checking' | 'locked' | 'unlocked'

export default function Home() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [accessConfigured, setAccessConfigured] = useState(true)
  const [pinHash, setPinHash] = useState<string | null>(null)
  const [biometricCredentialId, setBiometricCredentialId] = useState<string | null>(null)
  const [pinUnlocked, setPinUnlocked] = useState(false)
  const hiddenAtRef = useRef<number | null>(null)
  const [focusLogInput, setFocusLogInput] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URL(window.location.href).searchParams.get('focusLog') === '1'
  })
  const [focusAskInput, setFocusAskInput] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URL(window.location.href).searchParams.get('focusAsk') === '1'
  })

  useEffect(() => {
    const loadApp = async () => {
      try {
        const sessionRes = await fetch('/api/auth/session', { cache: 'no-store' })
        const session = await sessionRes.json()
        setAccessConfigured(!!session.configured)
        setAccessState(session.authenticated ? 'unlocked' : 'locked')
      } catch {
        setAccessConfigured(false)
        setAccessState('locked')
      }

      const { getDB, getSetting } = await import('@/lib/db')
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
    }

    loadApp()
    registerServiceWorker()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const shouldFocusLog = url.searchParams.get('focusLog') === '1'
    const shouldFocusAsk = url.searchParams.get('focusAsk') === '1'
    if (!shouldFocusLog && !shouldFocusAsk) return
    url.searchParams.delete('focusLog')
    url.searchParams.delete('focusAsk')
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

  if (appState === 'loading' || accessState === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">💸</span>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (accessState === 'locked') {
    return (
      <AppAccessLockScreen
        configured={accessConfigured}
        onUnlock={() => setAccessState('unlocked')}
      />
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

  return (
    <AppShell
      focusLogInput={focusLogInput}
      focusAskInput={focusAskInput}
      onLogInputFocused={() => setFocusLogInput(false)}
      onAskInputFocused={() => setFocusAskInput(false)}
    />
  )
}
