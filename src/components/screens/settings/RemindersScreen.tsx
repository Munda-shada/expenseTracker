'use client'

import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '@/lib/db'
import {
  getReminderPermissionStatus,
  ReminderPermissionStatus,
  requestReminderPermission,
  showReminderNotification,
} from '@/lib/reminders'

interface Props {
  onBack: () => void
}

export default function RemindersScreen({ onBack }: Props) {
  const [enabled, setEnabled] = useState(true)
  const [time, setTime] = useState('21:00')
  const [permission, setPermission] = useState<ReminderPermissionStatus>('default')
  const [budgetAlerts, setBudgetAlerts] = useState(true)
  const [pendingAlerts, setPendingAlerts] = useState(true)
  const [backupAlerts, setBackupAlerts] = useState(true)
  const [recurringAlerts, setRecurringAlerts] = useState(true)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadSettings = async () => {
    const [reminderEnabled, reminderTime, budget, pending, backup, recurring] = await Promise.all([
      getSetting('reminderEnabled'),
      getSetting('reminderTime'),
      getSetting('notificationBudgetEnabled'),
      getSetting('notificationPendingEnabled'),
      getSetting('notificationBackupEnabled'),
      getSetting('notificationRecurringEnabled'),
    ])
    setEnabled(reminderEnabled !== false)
    setTime(reminderTime ?? '21:00')
    setPermission(getReminderPermissionStatus())
    setBudgetAlerts(budget !== false)
    setPendingAlerts(pending !== false)
    setBackupAlerts(backup !== false)
    setRecurringAlerts(recurring !== false)
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const toggleEnabled = async () => {
    const next = !enabled
    setEnabled(next)
    await setSetting('reminderEnabled', next)
    if (next && permission === 'default') {
      const nextPermission = await requestReminderPermission()
      setPermission(nextPermission)
    }
  }

  const updateTime = async (value: string) => {
    setTime(value)
    await setSetting('reminderTime', value)
  }

  const requestPermission = async () => {
    setLoading(true)
    const nextPermission = await requestReminderPermission()
    setPermission(nextPermission)
    setLoading(false)
  }

  const updateNotificationSetting = async (
    key:
      | 'notificationBudgetEnabled'
      | 'notificationPendingEnabled'
      | 'notificationBackupEnabled'
      | 'notificationRecurringEnabled',
    value: boolean
  ) => {
    await setSetting(key, value)
  }

  const sendTest = async () => {
    setLoading(true)
    let currentPermission = permission
    if (currentPermission === 'default') {
      currentPermission = await requestReminderPermission()
      setPermission(currentPermission)
    }
    if (currentPermission === 'granted') {
      await showReminderNotification(true)
      showToast('Test reminder sent')
    } else if (currentPermission === 'denied') {
      showToast('Notifications are blocked')
    } else {
      showToast('Notifications are not supported')
    }
    setLoading(false)
  }

  const permissionCopy: Record<ReminderPermissionStatus, { title: string; body: string }> = {
    unsupported: {
      title: 'Not supported',
      body: 'This browser cannot show local notifications.',
    },
    default: {
      title: 'Permission needed',
      body: 'Allow notifications to receive daily reminders.',
    },
    granted: {
      title: 'Notifications enabled',
      body: enabled ? `Reminder is set for ${time}.` : 'Turn reminders on to use notifications.',
    },
    denied: {
      title: 'Notifications blocked',
      body: 'Enable notifications for this site in browser settings.',
    },
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
          <h1 className="text-xl font-bold text-gray-800">Reminders</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-9">
          Local reminders while the app is open or resumed
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Daily reminder</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Get nudged to log expenses every day.
              </p>
            </div>
            <button
              onClick={toggleEnabled}
              className={`w-12 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                enabled ? 'bg-indigo-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  enabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Reminder time</p>
              <p className="text-xs text-gray-400 mt-0.5">Uses your device local time.</p>
            </div>
            <input
              type="time"
              value={time}
              onChange={(e) => updateTime(e.target.value)}
              className="text-sm font-semibold text-indigo-600 bg-gray-50 rounded-xl px-3 py-2 outline-none"
            />
          </div>
        </div>

        <div className="bg-indigo-50 rounded-2xl px-4 py-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-indigo-700">
              {permissionCopy[permission].title}
            </p>
            <p className="text-xs text-indigo-500 mt-0.5 leading-relaxed">
              {permissionCopy[permission].body}
            </p>
          </div>

          <div className="flex gap-2">
            {permission === 'default' && (
              <button
                onClick={requestPermission}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Requesting...' : 'Allow Notifications'}
              </button>
            )}
            <button
              onClick={sendTest}
              disabled={loading || permission === 'unsupported'}
              className="flex-1 py-2.5 rounded-xl bg-white text-indigo-600 text-sm font-semibold disabled:opacity-50"
            >
              Send Test
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <NotificationToggle
            label="Budget warnings"
            description="Notify when monthly spend reaches 80%."
            enabled={budgetAlerts}
            onToggle={async () => {
              const next = !budgetAlerts
              setBudgetAlerts(next)
              await updateNotificationSetting('notificationBudgetEnabled', next)
            }}
          />
          <NotificationToggle
            label="Offline queue"
            description="Notify when logs are waiting to retry."
            enabled={pendingAlerts}
            onToggle={async () => {
              const next = !pendingAlerts
              setPendingAlerts(next)
              await updateNotificationSetting('notificationPendingEnabled', next)
            }}
          />
          <NotificationToggle
            label="Backup reminders"
            description="Notify if backups are stale."
            enabled={backupAlerts}
            onToggle={async () => {
              const next = !backupAlerts
              setBackupAlerts(next)
              await updateNotificationSetting('notificationBackupEnabled', next)
            }}
          />
          <NotificationToggle
            label="Recurring expenses"
            description="Notify when scheduled entries are due."
            enabled={recurringAlerts}
            onToggle={async () => {
              const next = !recurringAlerts
              setRecurringAlerts(next)
              await updateNotificationSetting('notificationRecurringEnabled', next)
            }}
            last
          />
        </div>

        <p className="text-xs text-gray-400 text-center px-4">
          True background push is not enabled yet. The app checks reminders when it is open,
          focused, or resumed.
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

function NotificationToggle({
  label,
  description,
  enabled,
  onToggle,
  last = false,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  last?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${last ? '' : 'border-b border-gray-50'}`}
    >
      <span>
        <span className="block text-sm font-semibold text-gray-800">{label}</span>
        <span className="mt-0.5 block text-xs text-gray-400">{description}</span>
      </span>
      <span className={`relative h-6 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
