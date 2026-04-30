import { createJsonBackup } from './backup'
import { getSetting, setSetting } from './db'
import { formatLocalDateString } from './utils'

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send-form'
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface EmailBackupConfigStatus {
  configured: boolean
  missing: string[]
}

export function getEmailBackupConfigStatus(): EmailBackupConfigStatus {
  const required = {
    NEXT_PUBLIC_EMAILJS_SERVICE_ID: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID,
    NEXT_PUBLIC_EMAILJS_TEMPLATE_ID: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID,
    NEXT_PUBLIC_EMAILJS_PUBLIC_KEY: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY,
  }
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  return { configured: missing.length === 0, missing }
}

export function isValidEmailBackupAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function toDateStamp(value = new Date()): string {
  return formatLocalDateString(value)
}

function isDueToday(day: number, time: string): boolean {
  const now = new Date()
  if (now.getDay() !== day) return false

  const [hour = '21', minute = '00'] = time.split(':')
  const due = new Date()
  due.setHours(Number(hour), Number(minute), 0, 0)
  return now.getTime() >= due.getTime()
}

export async function sendEmailBackup(toEmail: string): Promise<void> {
  const address = toEmail.trim()
  if (!isValidEmailBackupAddress(address)) {
    throw new Error('Valid email address daalo.')
  }

  const status = getEmailBackupConfigStatus()
  if (!status.configured) {
    throw new Error(`EmailJS setup is missing: ${status.missing.join(', ')}`)
  }

  const backup = await createJsonBackup()
  const backupJson = JSON.stringify(backup, null, 2)
  const backupFile = new File(
    [new Blob([backupJson], { type: 'application/json;charset=utf-8' })],
    `expense-backup-${toDateStamp()}.json`,
    { type: 'application/json' }
  )

  const formData = new FormData()
  formData.append('service_id', process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID ?? '')
  formData.append('template_id', process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID ?? '')
  formData.append('user_id', process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY ?? '')
  formData.append('to_email', address)
  formData.append('backup_date', new Date(backup.metadata.exportedAt).toLocaleString('en-IN'))
  formData.append('entry_count', String(backup.data.entries.length))
  formData.append('app_name', 'Expense Tracker')
  formData.append('message', 'Your weekly Expense Tracker JSON backup is attached.')
  formData.append('backup_file', backupFile)

  const response = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Email backup failed with status ${response.status}.`)
  }

  const now = Date.now()
  await Promise.all([
    setSetting('lastEmailBackupAt', now),
    setSetting('lastBackupAt', now),
  ])
}

let weeklyBackupInFlight = false

export async function checkWeeklyEmailBackup(): Promise<boolean> {
  if (weeklyBackupInFlight) return false

  const [enabled, address, day, time, lastSentAt] = await Promise.all([
    getSetting('emailBackupEnabled'),
    getSetting('emailBackupAddress'),
    getSetting('emailBackupDay'),
    getSetting('emailBackupTime'),
    getSetting('lastEmailBackupAt'),
  ])

  const normalizedAddress = address ?? ''
  const normalizedDay = typeof day === 'number' ? day : 0
  const normalizedTime = time ?? '21:00'
  const normalizedLastSentAt = lastSentAt ?? 0

  if (!enabled) return false
  if (!isValidEmailBackupAddress(normalizedAddress)) return false
  if (!getEmailBackupConfigStatus().configured) return false
  if (!isDueToday(normalizedDay, normalizedTime)) return false
  if (normalizedLastSentAt > 0 && Date.now() - normalizedLastSentAt < ONE_WEEK_MS) {
    return false
  }

  weeklyBackupInFlight = true
  try {
    await sendEmailBackup(normalizedAddress)
    return true
  } finally {
    weeklyBackupInFlight = false
  }
}
