import { getBudgets, getDueRecurringRules, getEntriesInRange, getPendingEntries, getSetting, setSetting } from './db'
import { getTodayString } from './utils'

export type ReminderPermissionStatus =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied'

export function getReminderPermissionStatus(): ReminderPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestReminderPermission(): Promise<ReminderPermissionStatus> {
  if (getReminderPermissionStatus() === 'unsupported') return 'unsupported'
  const permission = await Notification.requestPermission()
  await setSetting('notificationPermission', permission)
  return permission
}

function isReminderDue(reminderTime: string): boolean {
  const [hour = '21', minute = '00'] = reminderTime.split(':')
  const now = new Date()
  const due = new Date()
  due.setHours(Number(hour), Number(minute), 0, 0)
  return now.getTime() >= due.getTime()
}

function openLogFocusUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set('focusLog', '1')
  window.location.href = url.toString()
}

export async function showReminderNotification(test = false): Promise<boolean> {
  if (getReminderPermissionStatus() !== 'granted') return false

  const notification = new Notification(
    test ? 'Expense Tracker test reminder' : 'Log your expenses',
    {
      body: test ? 'Notifications are working.' : 'Take a moment to add today’s spending.',
      tag: test ? 'expense-tracker-test-reminder' : `expense-tracker-reminder-${getTodayString()}`,
      icon: '/icon-192.png',
    }
  )

  notification.onclick = () => {
    window.focus()
    openLogFocusUrl()
    notification.close()
  }

  return true
}

async function showAppNotification({
  title,
  body,
  tag,
  focusLog = false,
}: {
  title: string
  body: string
  tag: string
  focusLog?: boolean
}): Promise<boolean> {
  if (getReminderPermissionStatus() !== 'granted') return false
  const notification = new Notification(title, { body, tag, icon: '/icon-192.png' })
  notification.onclick = () => {
    window.focus()
    if (focusLog) openLogFocusUrl()
    notification.close()
  }
  return true
}

export async function checkDailyReminder(): Promise<boolean> {
  const [enabled, reminderTime, lastShownDate] = await Promise.all([
    getSetting('reminderEnabled'),
    getSetting('reminderTime'),
    getSetting('lastReminderShownDate'),
  ])
  const today = getTodayString()

  if (!enabled) return false
  if (lastShownDate === today) return false
  if (!isReminderDue(reminderTime ?? '21:00')) return false
  if (getReminderPermissionStatus() !== 'granted') return false

  const shown = await showReminderNotification()
  if (shown) await setSetting('lastReminderShownDate', today)
  return shown
}

export async function checkPowerNotifications(): Promise<void> {
  const today = getTodayString()
  if (getReminderPermissionStatus() !== 'granted') return

  const [
    budgetEnabled,
    pendingEnabled,
    backupEnabled,
    recurringEnabled,
    lastBudgetDate,
    lastPendingDate,
    lastBackupDate,
    lastRecurringDate,
    backupAt,
  ] = await Promise.all([
    getSetting('notificationBudgetEnabled'),
    getSetting('notificationPendingEnabled'),
    getSetting('notificationBackupEnabled'),
    getSetting('notificationRecurringEnabled'),
    getSetting('lastBudgetNotificationDate'),
    getSetting('lastPendingNotificationDate'),
    getSetting('lastBackupNotificationDate'),
    getSetting('lastRecurringNotificationDate'),
    getSetting('lastBackupAt'),
  ])

  if (pendingEnabled !== false && lastPendingDate !== today) {
    const pending = await getPendingEntries()
    if (pending.length > 0) {
      const shown = await showAppNotification({
        title: 'Pending logs waiting',
        body: `${pending.length} offline ${pending.length === 1 ? 'log needs' : 'logs need'} retrying.`,
        tag: `expense-tracker-pending-${today}`,
        focusLog: true,
      })
      if (shown) await setSetting('lastPendingNotificationDate', today)
    }
  }

  if (recurringEnabled !== false && lastRecurringDate !== today) {
    const due = await getDueRecurringRules(today)
    if (due.length > 0) {
      const shown = await showAppNotification({
        title: 'Recurring expense due',
        body: `${due.length} scheduled ${due.length === 1 ? 'entry is' : 'entries are'} ready to review.`,
        tag: `expense-tracker-recurring-${today}`,
        focusLog: true,
      })
      if (shown) await setSetting('lastRecurringNotificationDate', today)
    }
  }

  if (budgetEnabled !== false && lastBudgetDate !== today) {
    const monthStart = `${today.slice(0, 8)}01`
    const [entries, budgets] = await Promise.all([
      getEntriesInRange(monthStart, today),
      getBudgets(),
    ])
    const budget = budgets.find((item) => item.categoryId === 'overall')
    const spent = entries
      .filter((entry) => entry.type === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0)
    if (budget && spent >= budget.monthlyLimit * 0.8) {
      const shown = await showAppNotification({
        title: spent >= budget.monthlyLimit ? 'Budget crossed' : 'Budget warning',
        body: `${Math.min(100, (spent / budget.monthlyLimit) * 100).toFixed(0)}% of your monthly budget is used.`,
        tag: `expense-tracker-budget-${today}`,
      })
      if (shown) await setSetting('lastBudgetNotificationDate', today)
    }
  }

  if (backupEnabled !== false && lastBackupDate !== today) {
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (!backupAt || Date.now() - backupAt > sevenDays) {
      const shown = await showAppNotification({
        title: 'Backup reminder',
        body: 'Your local expense data has not been backed up recently.',
        tag: `expense-tracker-backup-${today}`,
      })
      if (shown) await setSetting('lastBackupNotificationDate', today)
    }
  }
}
