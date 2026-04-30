'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, Bell, Database, Download, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { clearFailedPendingLogs, getPendingEntries, updatePendingLogStatus } from '@/lib/db'
import { exportJsonBackup } from '@/lib/backup'
import { getDataHealthSnapshot, DataHealthSnapshot } from '@/lib/dataHealth'
import { getSyncStatus, SyncStatus } from '@/lib/syncEngine'

interface Props {
  onBack: () => void
}

function formatDate(value: number | null): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(value: number | null): string {
  if (!value) return 'Unknown'
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export default function DataHealthScreen({ onBack }: Props) {
  const [snapshot, setSnapshot] = useState<DataHealthSnapshot | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [health, sync] = await Promise.all([getDataHealthSnapshot(), getSyncStatus()])
    setSnapshot(health)
    setSyncStatus(sync)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2500)
  }

  const retryPending = async () => {
    const pending = await getPendingEntries()
    await Promise.all(pending.map((entry) => updatePendingLogStatus(entry.id, 'pending')))
    await load()
    showToast('Pending logs marked for retry')
  }

  const clearFailed = async () => {
    const count = await clearFailedPendingLogs()
    await load()
    showToast(count ? `Cleared ${count} failed logs` : 'No failed logs')
  }

  const checkUpdate = async () => {
    const registration = await navigator.serviceWorker?.getRegistration()
    await registration?.update()
    await load()
    showToast('Checked for app update')
  }

  const exportBackup = async () => {
    await exportJsonBackup()
    await load()
    showToast('Backup exported')
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-indigo-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Data health</h1>
        </div>
        <p className="ml-9 mt-1 text-xs text-gray-400">Storage, backups, offline queue, and app status.</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        {loading || !snapshot ? (
          <div className="rounded-2xl bg-white px-4 py-6 text-center text-sm font-semibold text-gray-500 shadow-sm">
            Loading health check...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <HealthCard icon={Database} label="Entries" value={String(snapshot.recordCounts.entries ?? 0)} />
              <HealthCard icon={Activity} label="Pending" value={String(snapshot.pendingCount)} warning={snapshot.pendingCount > 0} />
              <HealthCard icon={Bell} label="Notifications" value={snapshot.notificationPermission} />
              <HealthCard icon={RefreshCw} label="Service worker" value={snapshot.serviceWorkerStatus} />
              <HealthCard
                icon={RefreshCw}
                label="Cloud sync"
                value={syncStatus?.enabled ? syncStatus.lastSyncStatus : 'off'}
                warning={syncStatus?.lastSyncStatus === 'error'}
              />
            </div>

            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-indigo-500" />
                <p className="text-sm font-bold text-gray-800">Storage</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{
                    width: snapshot.storageUsage && snapshot.storageQuota
                      ? `${Math.min((snapshot.storageUsage / snapshot.storageQuota) * 100, 100)}%`
                      : '0%',
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {formatBytes(snapshot.storageUsage)} used of {formatBytes(snapshot.storageQuota)}
              </p>
            </div>

            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="text-sm font-bold text-gray-800">Backup</p>
              <p className="mt-1 text-xs text-gray-400">Last backup: {formatDate(snapshot.lastBackupAt)}</p>
              <p className="mt-1 text-xs text-gray-400">Last cloud sync: {formatDate(syncStatus?.lastSyncAt ?? 0)}</p>
              <p className="mt-1 text-xs text-gray-400">App version: {snapshot.appVersion}</p>
            </div>

            <div className="rounded-2xl bg-white shadow-sm">
              <HealthAction icon={Download} title="Export JSON backup" onClick={exportBackup} />
              <HealthAction icon={RefreshCw} title="Retry pending logs" onClick={retryPending} />
              <HealthAction icon={Trash2} title="Clear failed pending logs" onClick={clearFailed} />
              <HealthAction icon={RefreshCw} title="Check for app update" onClick={checkUpdate} last />
            </div>

            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <p className="mb-2 text-sm font-bold text-gray-800">Record counts</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(snapshot.recordCounts).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-gray-400">{key}</p>
                    <p className="text-sm font-black text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  )
}

function HealthCard({
  icon: Icon,
  label,
  value,
  warning = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div className={`rounded-2xl border px-3 py-3 shadow-sm ${warning ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-white'}`}>
      <Icon className={`mb-2 h-4 w-4 ${warning ? 'text-amber-600' : 'text-indigo-500'}`} />
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-gray-800">{value}</p>
    </div>
  )
}

function HealthAction({
  icon: Icon,
  title,
  onClick,
  last = false,
}: {
  icon: LucideIcon
  title: string
  onClick: () => void
  last?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${last ? '' : 'border-b border-gray-50'}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold text-gray-800">{title}</span>
    </button>
  )
}
