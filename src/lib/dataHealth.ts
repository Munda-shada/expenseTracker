import { getDB, getPendingEntries, getSetting } from './db'
import { getReminderPermissionStatus } from './reminders'

export interface DataHealthSnapshot {
  generatedAt: number
  recordCounts: Record<string, number>
  pendingCount: number
  failedPendingCount: number
  lastBackupAt: number | null
  notificationPermission: string
  serviceWorkerStatus: string
  storageUsage: number | null
  storageQuota: number | null
  appVersion: string
}

const STORE_NAMES = [
  'entries',
  'categories',
  'tags',
  'budgets',
  'lentBorrowed',
  'recurringRules',
  'quickQuestions',
  'chatHistory',
  'settings',
  'syncTombstones',
  'syncConflicts',
] as const

export async function getDataHealthSnapshot(): Promise<DataHealthSnapshot> {
  const db = await getDB()
  const pending = await getPendingEntries()
  const counts: Record<string, number> = {}
  await Promise.all(STORE_NAMES.map(async (store) => {
    counts[store] = await db.count(store)
  }))

  const estimate =
    typeof navigator !== 'undefined' && navigator.storage?.estimate
      ? await navigator.storage.estimate()
      : null
  const registration =
    typeof navigator !== 'undefined' && navigator.serviceWorker
      ? await navigator.serviceWorker.getRegistration()
      : null

  return {
    generatedAt: Date.now(),
    recordCounts: counts,
    pendingCount: pending.length,
    failedPendingCount: pending.filter((entry) => entry.pendingStatus === 'failed').length,
    lastBackupAt: (await getSetting('lastBackupAt')) || null,
    notificationPermission: getReminderPermissionStatus(),
    serviceWorkerStatus: registration
      ? registration.waiting
        ? 'update waiting'
        : registration.active
          ? 'active'
          : 'registered'
      : 'not registered',
    storageUsage: estimate?.usage ?? null,
    storageQuota: estimate?.quota ?? null,
    appVersion: '2.0',
  }
}
