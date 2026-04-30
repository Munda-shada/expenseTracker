'use client'

import { useEffect, useRef, useState } from 'react'
import BottomNav from './BottomNav'
import HomeScreen from './screens/HomeScreen'
import StatsScreen from './screens/StatsScreen'
import LentScreen from './screens/LentScreen'
import SettingsScreen from './screens/SettingsScreen'
import HistoryScreen from './screens/HistoryScreen'
import { applyServiceWorkerUpdate } from '@/lib/serviceWorker'
import { getAllEntries, getSetting, setSetting } from '@/lib/db'
import { scheduleCloudSync } from '@/lib/syncEngine'

type Tab = 'home' | 'stats' | 'lent' | 'settings'

interface Props {
  focusLogInput?: boolean
  onLogInputFocused?: () => void
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

export default function AppShell({ focusLogInput = false, onLogInputFocused }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [showHistory, setShowHistory] = useState(false)
  const [historyFilters, setHistoryFilters] = useState<object | null>(null)
  const [statusToast, setStatusToast] = useState<string | null>(null)
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [isPwaInstalled, setIsPwaInstalled] = useState(false)
  const [canInstallPwa, setCanInstallPwa] = useState(false) // Track if PWA can be installed
  const openCountedRef = useRef(false)

  useEffect(() => {
    let toastTimer: ReturnType<typeof setTimeout> | null = null
    let reloading = false

    const showTransientToast = (message: string) => {
      setStatusToast(message)
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(() => setStatusToast(null), 3500)
    }

    const handleOffline = () => showTransientToast('Offline. New logs will queue locally.')
    const handleOnline = () => showTransientToast('Back online. Pending logs can retry now.')
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ registration?: ServiceWorkerRegistration }>).detail
      setUpdateRegistration(detail?.registration ?? null)
    }
    const handleControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    window.addEventListener('app-update-available', handleUpdate)
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange)

    return () => {
      if (toastTimer) clearTimeout(toastTimer)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('app-update-available', handleUpdate)
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  useEffect(() => {
    let mutationTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleStartupSync = () => {
      scheduleCloudSync('startup').catch((error: Error) => console.error(error))
    }
    const scheduleFocusSync = () => {
      scheduleCloudSync('focus').catch((error: Error) => console.error(error))
    }
    const scheduleMutationSync = () => {
      if (mutationTimer) clearTimeout(mutationTimer)
      mutationTimer = setTimeout(() => {
        scheduleCloudSync('mutation').catch((error: Error) => console.error(error))
      }, 2000)
    }

    scheduleStartupSync()
    window.addEventListener('online', scheduleFocusSync)
    window.addEventListener('focus', scheduleFocusSync)
    window.addEventListener('expense-data-mutated', scheduleMutationSync)

    return () => {
      if (mutationTimer) clearTimeout(mutationTimer)
      window.removeEventListener('online', scheduleFocusSync)
      window.removeEventListener('focus', scheduleFocusSync)
      window.removeEventListener('expense-data-mutated', scheduleMutationSync)
    }
  }, [])

  useEffect(() => {
    setIsPwaInstalled(isRunningAsInstalledPwa())

    const refreshInstallEligibility = async (promptEvent: BeforeInstallPromptEvent | null) => {
      if (isRunningAsInstalledPwa()) return

      const [openCount, dismissed, entries] = await Promise.all([
        getSetting('appOpenCount'),
        getSetting('installPromptDismissed'),
        getAllEntries(),
      ])
      const nextOpenCount = openCountedRef.current ? (openCount ?? 0) : (openCount ?? 0) + 1
      if (!openCountedRef.current) {
        openCountedRef.current = true
        await setSetting('appOpenCount', nextOpenCount)
      }
      console.log('[PWA] Install eligibility check:', { promptEvent: !!promptEvent, dismissed, nextOpenCount, entriesCount: entries.length })
      if (promptEvent && !dismissed && nextOpenCount >= 3 && entries.length >= 5) {
        console.log('[PWA] Showing install banner')
        setShowInstallBanner(true)
      }
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      console.log('[PWA] beforeinstallprompt event fired')
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      setInstallPrompt(promptEvent)
      setCanInstallPwa(true) // Mark that PWA can be installed
      refreshInstallEligibility(promptEvent)
    }

    const handleAppInstalled = () => {
      console.log('[PWA] App installed successfully')
      setIsPwaInstalled(true)
      setShowInstallBanner(false)
      setInstallPrompt(null)
    }

    const standaloneMedia = window.matchMedia('(display-mode: standalone)')
    const handleStandaloneChange = (event: MediaQueryListEvent) => {
      setIsPwaInstalled(event.matches || isRunningAsInstalledPwa())
    }

    console.log('[PWA] Setting up event listeners. Current state:', {
      isPwaInstalled: isRunningAsInstalledPwa(),
      hasServiceWorker: 'serviceWorker' in navigator,
      supportsWebApp: 'BeforeInstallPromptEvent' in window,
    })

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    standaloneMedia.addEventListener('change', handleStandaloneChange)
    refreshInstallEligibility(null)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      standaloneMedia.removeEventListener('change', handleStandaloneChange)
    }
  }, [])

  const dismissInstallBanner = async () => {
    setShowInstallBanner(false)
    await setSetting('installPromptDismissed', true)
  }

  const installApp = async () => {
    if (!installPrompt) {
      console.log('[PWA] No install prompt available. Trying alternative installation methods...')
      // Fallback for testing: Allow manual installation trigger
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        console.log('[PWA] Service Worker available. App can be installed manually.')
        alert('To install this app:\n1. Chrome menu → More tools → Create shortcut\n2. Check "Open as window" if available\n3. Click Create')
      }
      return
    }
    console.log('[PWA] Triggering installation prompt')
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    console.log('[PWA] User choice:', outcome)
    setShowInstallBanner(false)
    // Keep installPrompt available in Settings even after dismissing banner
    // Only clear it after successful installation (handled by appinstalled event)
    if (outcome === 'accepted') {
      await setSetting('installPromptDismissed', true)
    }
  }

  const handleNavigateToHistory = (filters: object) => {
    setHistoryFilters(filters)
    setShowHistory(true)
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            focusLogInput={focusLogInput}
            onLogInputFocused={onLogInputFocused}
            onViewAll={() => {
              setHistoryFilters(null)
              setShowHistory(true)
            }}
            onNavigateToHistory={handleNavigateToHistory}
          />
        )
      case 'stats':    return <StatsScreen onNavigateToHistory={handleNavigateToHistory} />
      case 'lent':     return <LentScreen />
      case 'settings':
        return (
          <SettingsScreen
            canInstallPwa={canInstallPwa && !isPwaInstalled}
            onInstallPwa={installApp}
          />
        )
    }
  }

  return (
    <div className="app-shell-bg relative min-h-screen text-slate-900">
      <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {showHistory ? (
          <div>
            <button
              onClick={() => {
                setShowHistory(false)
                setHistoryFilters(null)
              }}
              className="flex items-center gap-1 px-4 pt-5 pb-2 text-sm text-indigo-500 font-medium"
            >
              ← Back
            </button>
            <HistoryScreen preFilters={historyFilters} />
          </div>
        ) : (
          renderScreen()
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onChange={(tab) => {
          setActiveTab(tab)
          setShowHistory(false)
          setHistoryFilters(null)
        }}
      />

      {showInstallBanner && installPrompt && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] px-4">
          <div className="mx-auto max-w-sm rounded-2xl bg-white px-4 py-3 shadow-lg border border-indigo-100">
            <p className="text-sm font-semibold text-gray-800">Install Expense Tracker</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Add it to your home screen for quicker offline access.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={dismissInstallBanner}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-500 text-sm font-semibold"
              >
                Not now
              </button>
              <button
                onClick={installApp}
                className="flex-1 py-2 rounded-xl bg-indigo-500 text-white text-sm font-semibold"
              >
                Install
              </button>
            </div>
          </div>
        </div>
      )}

      {(statusToast || updateRegistration) && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] flex justify-center px-4">
          <div className="flex max-w-sm items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
            <span className="flex-1">
              {updateRegistration ? 'Update available' : statusToast}
            </span>
            {updateRegistration && (
              <button
                onClick={() => applyServiceWorkerUpdate(updateRegistration)}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-900"
              >
                Update
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
