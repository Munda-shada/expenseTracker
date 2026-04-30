'use client'

import { useEffect, useRef, useState } from 'react'
import {
  BackupFile,
  exportEntriesCsv,
  exportEntriesPdf,
  exportJsonBackup,
  parseBackupJson,
  restoreJsonBackup,
} from '@/lib/backup'
import {
  getEmailBackupConfigStatus,
  isValidEmailBackupAddress,
  sendEmailBackup,
} from '@/lib/emailBackup'
import { getSetting, setSetting } from '@/lib/db'
import { backupToGoogleDrive } from '@/lib/driveBackup'
import type { ReportPeriod } from '@/lib/reports'
import { getSyncStatus, SyncStatus } from '@/lib/syncEngine'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Props {
  onBack: () => void
}

export default function BackupScreen({ onBack }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  const [emailBackupEnabled, setEmailBackupEnabled] = useState(false)
  const [emailBackupAddress, setEmailBackupAddress] = useState('')
  const [emailBackupDay, setEmailBackupDay] = useState(0)
  const [emailBackupTime, setEmailBackupTime] = useState('21:00')
  const [lastEmailBackupAt, setLastEmailBackupAt] = useState<number | null>(null)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('this_month')
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const emailConfig = getEmailBackupConfigStatus()

  const loadLastBackup = async () => {
    const [value, enabled, address, day, time, emailAt, defaultPeriod] = await Promise.all([
      getSetting('lastBackupAt'),
      getSetting('emailBackupEnabled'),
      getSetting('emailBackupAddress'),
      getSetting('emailBackupDay'),
      getSetting('emailBackupTime'),
      getSetting('lastEmailBackupAt'),
      getSetting('reportDefaultPeriod'),
    ])
    setLastBackupAt(value && value > 0 ? value : null)
    setEmailBackupEnabled(enabled ?? false)
    setEmailBackupAddress(address ?? '')
    setEmailBackupDay(day ?? 0)
    setEmailBackupTime(time ?? '21:00')
    setLastEmailBackupAt(emailAt && emailAt > 0 ? emailAt : null)
    setReportPeriod(defaultPeriod ?? 'this_month')
    setSyncStatus(await getSyncStatus())
  }

  useEffect(() => {
    loadLastBackup()
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const runAction = async (action: () => Promise<void>, success: string) => {
    setLoading(true)
    setError(null)
    try {
      await action()
      await loadLastBackup()
      showToast(success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const updateEmailBackupEnabled = async (value: boolean) => {
    setEmailBackupEnabled(value)
    await setSetting('emailBackupEnabled', value)
  }

  const updateEmailBackupAddress = async (value: string) => {
    setEmailBackupAddress(value)
    await setSetting('emailBackupAddress', value)
  }

  const updateEmailBackupDay = async (value: number) => {
    setEmailBackupDay(value)
    await setSetting('emailBackupDay', value)
  }

  const updateEmailBackupTime = async (value: string) => {
    setEmailBackupTime(value)
    await setSetting('emailBackupTime', value)
  }

  const sendTestEmailBackup = async () => {
    if (!emailConfig.configured) {
      setError(`EmailJS setup is missing: ${emailConfig.missing.join(', ')}`)
      return
    }
    if (!isValidEmailBackupAddress(emailBackupAddress)) {
      setError('Enter a valid email address before sending a test backup.')
      return
    }
    await runAction(async () => {
      await sendEmailBackup(emailBackupAddress)
    }, 'Test email backup sent')
  }

  const handlePdfExport = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await exportEntriesPdf({ period: reportPeriod })
      await loadLastBackup()
      if (result === 'downloaded') {
        setError('Popup was blocked. A printable HTML file was downloaded instead; open it and use Save as PDF.')
      } else {
        showToast('PDF export opened')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export PDF.')
    } finally {
      setLoading(false)
    }
  }

  const updateReportPeriod = async (value: ReportPeriod) => {
    setReportPeriod(value)
    await setSetting('reportDefaultPeriod', value)
  }

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const text = await file.text()
      setPendingImport(parseBackupJson(text))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read backup file.')
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!pendingImport) return
    await runAction(async () => {
      await restoreJsonBackup(pendingImport)
      setPendingImport(null)
      window.location.reload()
    }, 'Backup restored')
  }

  const formatBackupDate = (value: number) =>
    new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-indigo-500 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Export and backup</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-9">
          {lastBackupAt ? `Last backup: ${formatBackupDate(lastBackupAt)}` : 'No backup yet'}
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-indigo-50 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-indigo-600 mb-1">Private by design</p>
          <p className="text-xs text-indigo-500 leading-relaxed">
            Exports are created on this device. Nothing is uploaded to a server.
          </p>
          <p className="mt-2 text-xs font-semibold text-indigo-600">
            Cloud sync: {syncStatus?.enabled ? `${syncStatus.lastSyncStatus} · last ${syncStatus.lastSyncAt ? formatBackupDate(syncStatus.lastSyncAt) : 'never'}` : 'off'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {pendingImport && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-2xl px-4 py-3 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Restore this backup?</p>
              <p className="text-xs text-yellow-700 mt-1">
                This overwrites local app data. Exported {formatBackupDate(pendingImport.metadata.exportedAt)}.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <ImportCount label="Entries" count={pendingImport.data.entries.length} />
              <ImportCount label="Tags" count={pendingImport.data.tags.length} />
              <ImportCount label="Budgets" count={pendingImport.data.budgets.length} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingImport(null)}
                className="flex-1 py-2.5 rounded-xl bg-white text-gray-500 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Restoring...' : 'Overwrite & Restore'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-gray-50 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Report period</p>
              <p className="mt-0.5 text-xs text-gray-400">CSV and PDF reports use this month window.</p>
            </div>
            <select
              value={reportPeriod}
              onChange={(event) => updateReportPeriod(event.target.value as ReportPeriod)}
              className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-semibold text-indigo-600 outline-none"
            >
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
            </select>
          </div>
          <BackupAction
            emoji="📄"
            title="Export CSV"
            description="Spreadsheet-friendly entries export. Pending logs are excluded."
            disabled={loading}
            onClick={() => runAction(() => exportEntriesCsv({ period: reportPeriod }), 'CSV exported')}
          />
          <BackupAction
            emoji="🧾"
            title="Export PDF"
            description="Opens a printable report. Use Save as PDF from the print sheet."
            disabled={loading}
            onClick={handlePdfExport}
          />
          <BackupAction
            emoji="📦"
            title="Export JSON Backup"
            description="Full restore backup including settings, budgets, tags, and pending logs."
            disabled={loading}
            onClick={() => runAction(exportJsonBackup, 'JSON backup exported')}
          />
          <BackupAction
            emoji="📥"
            title="Import JSON Backup"
            description="Restore a previous JSON backup. This overwrites local data after confirmation."
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            last
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-gray-50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Weekly Email Backup</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {lastEmailBackupAt
                    ? `Last sent: ${formatBackupDate(lastEmailBackupAt)}`
                    : 'No email backup sent yet'}
                </p>
              </div>
              <button
                onClick={() => updateEmailBackupEnabled(!emailBackupEnabled)}
                className={`w-12 h-7 rounded-full p-0.5 transition-colors ${
                  emailBackupEnabled ? 'bg-indigo-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`block w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    emailBackupEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            <div
              className={`rounded-2xl px-4 py-3 ${
                emailConfig.configured ? 'bg-green-50' : 'bg-amber-50'
              }`}
            >
              <p
                className={`text-xs font-semibold mb-1 ${
                  emailConfig.configured ? 'text-green-700' : 'text-amber-700'
                }`}
              >
                {emailConfig.configured ? 'EmailJS configured' : 'EmailJS setup needed'}
              </p>
              <p
                className={`text-xs leading-relaxed ${
                  emailConfig.configured ? 'text-green-600' : 'text-amber-600'
                }`}
              >
                {emailConfig.configured
                  ? 'Weekly backups can be sent from this device while the app is open or resumed.'
                  : `Missing ${emailConfig.missing.join(', ')}. Configure these env vars and set the template attachment parameter to backup_file.`}
              </p>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-500">Backup email</span>
              <input
                type="email"
                value={emailBackupAddress}
                onChange={(e) => updateEmailBackupAddress(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Day</span>
                <select
                  value={emailBackupDay}
                  onChange={(e) => updateEmailBackupDay(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>{day}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-500">Time</span>
                <input
                  type="time"
                  value={emailBackupTime}
                  onChange={(e) => updateEmailBackupTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>

            <button
              onClick={sendTestEmailBackup}
              disabled={loading || !emailBackupEnabled || !emailConfig.configured || !isValidEmailBackupAddress(emailBackupAddress)}
              className="w-full py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send test backup'}
            </button>
              <button
    onClick={async () => {
      try {
        await backupToGoogleDrive()
        alert('Backup saved to Drive ✅')
      } catch (e) {
        console.error(e)
        alert('Drive backup failed')
      }
    }}
    className="w-full bg-indigo-500 text-white py-3 rounded-xl font-semibold"
  >
    One-shot backup to Google Drive
  </button>


            <p className="text-xs text-gray-400 leading-relaxed">
              Automatic weekly backup checks happen on app load, focus, and resume. No data is sent
              unless EmailJS is configured and the schedule is due.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => handleImportFile(e.target.files?.[0])}
        />

        <p className="text-xs text-gray-400 text-center px-4">
          CSV is export-only. Use JSON backup when you want to restore later.
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

function BackupAction({
  emoji,
  title,
  description,
  disabled,
  onClick,
  last = false,
}: {
  emoji: string
  title: string
  description: string
  disabled: boolean
  onClick: () => void
  last?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 disabled:opacity-50 ${
        !last ? 'border-b border-gray-50' : ''
      }`}
    >
      <span className="text-xl">{emoji}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-800">{title}</span>
        <span className="block text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</span>
      </span>
      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

function ImportCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-white rounded-xl px-2 py-2">
      <p className="text-base font-bold text-gray-800">{count}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  )
}
