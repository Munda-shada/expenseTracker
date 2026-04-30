import { getAllEntries, getBudgets, getCategories, getDB, getEntriesInRange, setSetting } from './db'
import { formatCurrency, getPeriodRange, getTodayString } from './utils'
import {
  Budget,
  Category,
  Correction,
  Entry,
  LentBorrowed,
  QuickAddTile,
  QuickQuestion,
  RecurringRule,
  ReconciliationCheck,
  Settings,
  Tag,
} from './types'

const BACKUP_FORMAT_VERSION = 1
const APP_VERSION = '2.0'
type ExportPeriod = 'all' | 'this_month' | 'last_month'

type SettingRecord = { key: keyof Settings; value: Settings[keyof Settings] }

interface BackupData {
  entries: Entry[]
  categories: Category[]
  tags: Tag[]
  budgets: Budget[]
  reconciliationChecks: ReconciliationCheck[]
  lentBorrowed: LentBorrowed[]
  corrections: Correction[]
  quickAddTiles: QuickAddTile[]
  quickQuestions: QuickQuestion[]
  recurringRules: RecurringRule[]
  settings: SettingRecord[]
}

export interface BackupFile {
  metadata: {
    appName: 'Expense Tracker'
    appVersion: string
    databaseName: 'expenseTrackerDB'
    databaseVersion: number
    backupFormatVersion: number
    exportedAt: number
  }
  data: BackupData
}

interface LooseDB {
  getAll(storeName: string): Promise<unknown[]>
  clear(storeName: string): Promise<void>
  put(storeName: string, value: unknown): Promise<unknown>
}

const JSON_STORES = [
  'entries',
  'categories',
  'tags',
  'budgets',
  'reconciliationChecks',
  'lentBorrowed',
  'corrections',
  'quickAddTiles',
  'quickQuestions',
  'recurringRules',
  'settings',
] as const

function csvEscape(value: unknown): string {
  const str = Array.isArray(value) ? value.join('|') : String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

function toDateStamp(): string {
  return getTodayString()
}

function getExportRange(period: ExportPeriod): { start: string; end: string } | null {
  if (period === 'all') return null
  return getPeriodRange(period)
}

async function getEntriesForExport(period: ExportPeriod): Promise<Entry[]> {
  const range = getExportRange(period)
  if (!range) return getAllEntries()
  const entries = await getEntriesInRange(range.start, range.end)
  return entries.sort((a, b) => b.createdAt - a.createdAt)
}

async function saveBlob(blob: Blob, filename: string, title: string): Promise<void> {
  const file =
    typeof File !== 'undefined'
      ? new File([blob], filename, { type: blob.type })
      : null
  const canShareFiles =
    !!file &&
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  if (canShareFiles && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, files: [file] })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportEntriesCsv(options: { period?: ExportPeriod } = {}): Promise<void> {
  const period = options.period ?? 'all'
  const [entries, categories] = await Promise.all([
    getEntriesForExport(period),
    getCategories(),
  ])
  const categoryById = new Map(categories.map((category) => [category.id, category.name]))
  const headers = [
    'date',
    'type',
    'amount',
    'categories',
    'tags',
    'note',
    'rawInput',
    'source',
    'confidence',
    'createdAt',
    'updatedAt',
  ]
  const rows = entries.map((entry) => [
    entry.date,
    entry.type,
    entry.amount,
    entry.categoryIds.map((id) => categoryById.get(id) ?? id),
    entry.tags,
    entry.note,
    entry.rawInput,
    entry.source,
    entry.confidence,
    new Date(entry.createdAt).toISOString(),
    new Date(entry.updatedAt).toISOString(),
  ])
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const suffix = period === 'all' ? toDateStamp() : `${period}-${toDateStamp()}`
  await saveBlob(blob, `expense-entries-${suffix}.csv`, 'Expense entries CSV')
}

function htmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function exportEntriesPdf(options: { period?: ExportPeriod } = {}): Promise<'opened' | 'downloaded'> {
  const period = options.period ?? 'all'
  const range = getExportRange(period)
  const [entries, categories, budgets] = await Promise.all([
    getEntriesForExport(period),
    getCategories(),
    getBudgets(),
  ])
  const categoryById = new Map(categories.map((category) => [category.id, category.name]))
  const generatedAt = new Date().toLocaleString('en-IN')
  const expenses = entries.filter((entry) => entry.type === 'expense')
  const income = entries.filter((entry) => entry.type === 'income')
  const expenseTotal = expenses.reduce((sum, entry) => sum + entry.amount, 0)
  const incomeTotal = income.reduce((sum, entry) => sum + entry.amount, 0)
  const overallBudget = budgets.find((budget) => budget.categoryId === 'overall')
  const categoryTotals = categories
    .map((category) => ({
      category,
      total: expenses
        .filter((entry) => entry.categoryIds.includes(category.id))
        .reduce((sum, entry) => sum + entry.amount, 0),
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)
  const tagTotals = new Map<string, number>()
  expenses.forEach((entry) => {
    entry.tags.forEach((tag) => tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + entry.amount))
  })
  const topTags = [...tagTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const topExpenses = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 8)
  const rows = entries.map((entry) => {
    const categoriesText = entry.categoryIds.map((id) => categoryById.get(id) ?? id).join(', ')
    return `
      <tr>
        <td>${htmlEscape(entry.date)}</td>
        <td>${htmlEscape(entry.type)}</td>
        <td class="amount">${htmlEscape(entry.amount)}</td>
        <td>${htmlEscape(categoriesText)}</td>
        <td>${htmlEscape(entry.tags.join(', '))}</td>
        <td>${htmlEscape(entry.note)}</td>
        <td>${htmlEscape(entry.source)}</td>
      </tr>
    `
  }).join('')
  const categoryRows = categoryTotals.map((item) => `
    <tr>
      <td>${htmlEscape(item.category.name)}</td>
      <td class="amount">${htmlEscape(formatCurrency(item.total))}</td>
      <td class="amount">${expenseTotal > 0 ? ((item.total / expenseTotal) * 100).toFixed(0) : 0}%</td>
    </tr>
  `).join('')
  const topExpenseRows = topExpenses.map((entry) => `
    <tr>
      <td>${htmlEscape(entry.date)}</td>
      <td>${htmlEscape(entry.note || entry.rawInput)}</td>
      <td>${htmlEscape(entry.categoryIds.map((id) => categoryById.get(id) ?? id).join(', '))}</td>
      <td class="amount">${htmlEscape(formatCurrency(entry.amount))}</td>
    </tr>
  `).join('')
  const tagText = topTags.length > 0
    ? topTags.map(([tag, total]) => `#${htmlEscape(tag)} ${htmlEscape(formatCurrency(total))}`).join(' · ')
    : 'No tags in this period.'
  const title = period === 'all' ? 'Expense Entries' : `Monthly Expense Report`
  const subtitle = range ? `${range.start} to ${range.end}` : 'All saved entries'

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Expense entries ${toDateStamp()}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
          h1 { margin: 0 0 4px; font-size: 24px; }
          h2 { margin: 22px 0 8px; font-size: 16px; }
          p { margin: 0 0 14px; color: #6b7280; font-size: 12px; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 18px 0; }
          .metric { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; }
          .metric span { display: block; color: #6b7280; font-size: 10px; text-transform: uppercase; }
          .metric strong { display: block; margin-top: 4px; font-size: 15px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; background: #f3f4f6; color: #374151; }
          th, td { border: 1px solid #e5e7eb; padding: 7px; vertical-align: top; }
          .amount { text-align: right; white-space: nowrap; }
          @media print { body { margin: 16px; } }
        </style>
      </head>
      <body>
        <h1>${htmlEscape(title)}</h1>
        <p>${htmlEscape(subtitle)} · Generated ${htmlEscape(generatedAt)} · ${entries.length} entries</p>
        <div class="summary">
          <div class="metric"><span>Expense</span><strong>${htmlEscape(formatCurrency(expenseTotal))}</strong></div>
          <div class="metric"><span>Income</span><strong>${htmlEscape(formatCurrency(incomeTotal))}</strong></div>
          <div class="metric"><span>Net</span><strong>${htmlEscape(formatCurrency(incomeTotal - expenseTotal))}</strong></div>
          <div class="metric"><span>Budget</span><strong>${overallBudget ? `${((expenseTotal / overallBudget.monthlyLimit) * 100).toFixed(0)}% used` : 'Not set'}</strong></div>
        </div>
        <h2>Category breakdown</h2>
        <table>
          <thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
          <tbody>${categoryRows || '<tr><td colspan="3">No expense categories.</td></tr>'}</tbody>
        </table>
        <h2>Top expenses</h2>
        <table>
          <thead><tr><th>Date</th><th>Note</th><th>Categories</th><th>Amount</th></tr></thead>
          <tbody>${topExpenseRows || '<tr><td colspan="4">No expenses.</td></tr>'}</tbody>
        </table>
        <h2>Top tags</h2>
        <p>${tagText}</p>
        <h2>Entries</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Categories</th>
              <th>Tags</th>
              <th>Note</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>
          window.addEventListener('load', () => {
            setTimeout(() => window.print(), 250)
          })
        </script>
      </body>
    </html>
  `

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    await saveBlob(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      `expense-entries-${period === 'all' ? toDateStamp() : `${period}-${toDateStamp()}`}.html`,
      'Printable expense entries'
    )
    return 'downloaded'
  }
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  return 'opened'
}

export async function createJsonBackup(): Promise<BackupFile> {
  const db = await getDB()
  const looseDb = db as unknown as LooseDB
  return {
    metadata: {
      appName: 'Expense Tracker',
      appVersion: APP_VERSION,
      databaseName: 'expenseTrackerDB',
      databaseVersion: 6,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: Date.now(),
    },
    data: {
      entries: await looseDb.getAll('entries') as Entry[],
      categories: await looseDb.getAll('categories') as Category[],
      tags: await looseDb.getAll('tags') as Tag[],
      budgets: await looseDb.getAll('budgets') as Budget[],
      reconciliationChecks: await looseDb.getAll('reconciliationChecks') as ReconciliationCheck[],
      lentBorrowed: await looseDb.getAll('lentBorrowed') as LentBorrowed[],
      corrections: await looseDb.getAll('corrections') as Correction[],
      quickAddTiles: await looseDb.getAll('quickAddTiles') as QuickAddTile[],
      quickQuestions: await looseDb.getAll('quickQuestions') as QuickQuestion[],
      recurringRules: await looseDb.getAll('recurringRules') as RecurringRule[],
      settings: await looseDb.getAll('settings') as SettingRecord[],
    },
  }
}

export async function exportJsonBackup(): Promise<void> {
  const backup = await createJsonBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  await saveBlob(blob, `expense-backup-${toDateStamp()}.json`, 'Expense Tracker backup')
  await setSetting('lastBackupAt', Date.now())
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readArray(data: Record<string, unknown>, key: keyof BackupData): unknown[] {
  const value = data[key]
  return Array.isArray(value) ? value : []
}

export function parseBackupJson(text: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }

  if (!isObject(parsed) || !isObject(parsed.metadata) || !isObject(parsed.data)) {
    throw new Error('Backup file has an invalid shape.')
  }
  if (parsed.metadata.databaseName !== 'expenseTrackerDB') {
    throw new Error('This backup does not belong to Expense Tracker.')
  }

  const data = parsed.data
  return {
    metadata: {
      appName: 'Expense Tracker',
      appVersion: String(parsed.metadata.appVersion ?? APP_VERSION),
      databaseName: 'expenseTrackerDB',
      databaseVersion: Number(parsed.metadata.databaseVersion ?? 6),
      backupFormatVersion: Number(parsed.metadata.backupFormatVersion ?? BACKUP_FORMAT_VERSION),
      exportedAt: Number(parsed.metadata.exportedAt ?? Date.now()),
    },
    data: {
      entries: readArray(data, 'entries') as Entry[],
      categories: readArray(data, 'categories') as Category[],
      tags: readArray(data, 'tags') as Tag[],
      budgets: readArray(data, 'budgets') as Budget[],
      reconciliationChecks: readArray(data, 'reconciliationChecks') as ReconciliationCheck[],
      lentBorrowed: readArray(data, 'lentBorrowed') as LentBorrowed[],
      corrections: readArray(data, 'corrections') as Correction[],
      quickAddTiles: readArray(data, 'quickAddTiles') as QuickAddTile[],
      quickQuestions: readArray(data, 'quickQuestions') as QuickQuestion[],
      recurringRules: readArray(data, 'recurringRules') as RecurringRule[],
      settings: readArray(data, 'settings') as SettingRecord[],
    },
  }
}

export async function restoreJsonBackup(backup: BackupFile): Promise<void> {
  const db = await getDB()
  const looseDb = db as unknown as LooseDB
  const dataByStore: Record<(typeof JSON_STORES)[number], unknown[]> = {
    entries: backup.data.entries,
    categories: backup.data.categories,
    tags: backup.data.tags,
    budgets: backup.data.budgets,
    reconciliationChecks: backup.data.reconciliationChecks,
    lentBorrowed: backup.data.lentBorrowed,
    corrections: backup.data.corrections,
    quickAddTiles: backup.data.quickAddTiles,
    quickQuestions: backup.data.quickQuestions,
    recurringRules: backup.data.recurringRules,
    settings: backup.data.settings,
  }

  for (const storeName of JSON_STORES) {
    await looseDb.clear(storeName)
    for (const record of dataByStore[storeName]) {
      await looseDb.put(storeName, record)
    }
  }

  await setSetting('lastBackupAt', Date.now())
}
