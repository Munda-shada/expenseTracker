'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Cloud, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import { clearSyncConflicts, getSyncConflicts, setSetting } from '@/lib/db'
import { getSyncStatus, runCloudSync, SyncStatus } from '@/lib/syncEngine'
import { SyncConflict } from '@/lib/types'

interface Props {
  onBack: () => void
}

function formatDate(value: number): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CloudSyncScreen({ onBack }: Props) {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [deviceName, setDeviceName] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [nextStatus, nextConflicts] = await Promise.all([
      getSyncStatus(),
      getSyncConflicts(8),
    ])
    setStatus(nextStatus)
    setDeviceName(nextStatus.deviceName)
    setConflicts(nextConflicts)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2500)
  }

  const syncNow = async () => {
    setLoading(true)
    try {
      await runCloudSync()
      await load()
      showToast('Cloud sync complete')
    } catch (error) {
      await load()
      showToast(error instanceof Error ? error.message : 'Cloud sync failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleSync = async () => {
    if (!status) return
    const next = !status.enabled
    await setSetting('syncEnabled', next)
    await load()
    if (next) await syncNow()
  }

  const toggleAutoSync = async () => {
    if (!status) return
    await setSetting('autoSyncEnabled', !status.autoSyncEnabled)
    await load()
  }

  const saveDeviceName = async () => {
    await setSetting('syncDeviceName', deviceName.trim() || 'Web device')
    await load()
    showToast('Device name saved')
  }

  const clearConflicts = async () => {
    await clearSyncConflicts()
    await load()
    showToast('Conflict log cleared')
  }

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 text-indigo-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Cloud sync</h1>
        </div>
        <p className="ml-9 mt-1 text-xs text-gray-400">Google Drive sync across your devices.</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        {isOffline && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <WifiOff className="h-5 w-5 text-amber-600" />
            <p className="text-sm font-semibold text-amber-700">You are offline. Sync will resume when connected.</p>
          </div>
        )}

        <div className="rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-500">Google Drive</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">
                {status?.enabled ? 'Sync is enabled' : 'Connect cloud sync'}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Data stays in your Google Drive file. No hosted database is used.
              </p>
            </div>
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              status?.lastSyncStatus === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
            }`}>
              {status?.lastSyncStatus === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatusPill label="Last sync" value={formatDate(status?.lastSyncAt ?? 0)} />
            <StatusPill label="Status" value={status?.lastSyncStatus ?? 'idle'} />
            <StatusPill label="Conflicts" value={String(status?.conflictCount ?? 0)} />
            <StatusPill label="File" value={status?.driveFileId ? 'Connected' : 'Not created'} />
          </div>

          {status?.lastSyncError && (
            <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2">
              <p className="text-xs font-semibold text-rose-600">{status.lastSyncError}</p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={toggleSync}
              disabled={loading}
              className={`flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 ${
                status?.enabled ? 'bg-slate-500' : 'bg-indigo-600'
              }`}
            >
              {status?.enabled ? 'Disable' : 'Connect'}
            </button>
            <button
              onClick={syncNow}
              disabled={loading || isOffline}
              className="flex-1 rounded-xl bg-indigo-50 py-3 text-sm font-bold text-indigo-600 disabled:opacity-50"
            >
              {loading || status?.inProgress ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Auto-sync</p>
              <p className="mt-0.5 text-xs text-gray-400">Runs on app start, focus, reconnect, and data changes.</p>
            </div>
            <button
              onClick={toggleAutoSync}
              className={`relative h-6 w-12 rounded-full transition-colors ${status?.autoSyncEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${status?.autoSyncEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
          <label className="block">
            <span className="text-sm font-bold text-gray-800">This device</span>
            <input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Device name"
            />
          </label>
          <button
            onClick={saveDeviceName}
            className="mt-3 w-full rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700"
          >
            Save device name
          </button>
        </div>

        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Conflict log</p>
              <p className="mt-0.5 text-xs text-gray-400">Newest edit wins; conflicts are kept here for visibility.</p>
            </div>
            {conflicts.length > 0 && (
              <button onClick={clearConflicts} className="text-xs font-bold text-indigo-600">Clear</button>
            )}
          </div>
          {conflicts.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-700">
              No sync conflicts recorded.
            </p>
          ) : (
            <div className="space-y-2">
              {conflicts.map((conflict) => (
                <div key={conflict.id} className="flex gap-2 rounded-2xl bg-amber-50 px-3 py-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-amber-800">
                      {conflict.storeName} · {conflict.recordKey}
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-700">
                      {conflict.winner} won · {formatDate(conflict.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={load}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-600"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh status
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  )
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-slate-800">{value}</p>
    </div>
  )
}
