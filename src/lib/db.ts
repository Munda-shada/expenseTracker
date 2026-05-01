import { openDB, DBSchema, IDBPDatabase } from 'idb'
import { v4 as uuidv4 } from 'uuid'
import {
  Entry, Category, Tag, Budget,
  LentBorrowed, Correction, QuickAddTile,
  ChatMessage, Settings, ReconciliationCheck, RecurringRule,
  QuickQuestion, SyncTombstone, SyncConflict, DEFAULT_PAYMENT_METHOD
} from './types'
import { normalizeTag } from './tagUtils'
import { formatLocalDateString, getTodayString } from './utils'

// ─── Schema ─────────────────────────────────────────────────
interface ExpenseTrackerDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: {
      'by-date': string
      'by-type': string
      'by-createdAt': number
      'by-category': string   // multiEntry: element type is string
      'by-tag': string        // multiEntry: element type is string
      'by-source': string
      'by-pending': number    // IDB doesn't support boolean indexes, use 0/1
    }
  }
  categories: {
    key: string
    value: Category
    indexes: { 'by-displayOrder': number }
  }
  tags: {
    key: string
    value: Tag
    indexes: {
      'by-usageCount': number
      'by-lastUsedAt': number
    }
  }
  budgets: {
    key: string
    value: Budget
    indexes: { 'by-categoryId': string }
  }
  reconciliationChecks: {
    key: string
    value: ReconciliationCheck
    indexes: {
      'by-month': string
      'by-createdAt': number
    }
  }
  lentBorrowed: {
    key: string
    value: LentBorrowed
    indexes: {
      'by-settled': number    // same, use 0/1 not boolean
      'by-counterparty': string
      'by-direction': string
    }
  }
  corrections: {
    key: string
    value: Correction
    indexes: { 'by-createdAt': number }
  }
  quickAddTiles: {
    key: string
    value: QuickAddTile
    indexes: {
      'by-displayOrder': number
      'by-usageCount': number
    }
  }
  quickQuestions: {
    key: string
    value: QuickQuestion
    indexes: { 'by-displayOrder': number }
  }
  recurringRules: {
    key: string
    value: RecurringRule
    indexes: {
      'by-nextDueDate': string
    }
  }
  chatHistory: {
    key: string
    value: ChatMessage
    indexes: { 'by-createdAt': number }
  }
  settings: {
    key: string
    value: { key: string; value: unknown; updatedAt?: number }
  }
  syncTombstones: {
    key: string
    value: SyncTombstone
    indexes: {
      'by-deletedAt': number
      'by-storeName': string
    }
  }
  syncConflicts: {
    key: string
    value: SyncConflict
    indexes: {
      'by-createdAt': number
      'by-storeName': string
    }
  }
}
// ─── Default seed data ───────────────────────────────────────
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-food', name: 'Food', emoji: '🍔', isDefault: true, displayOrder: 1, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-travel', name: 'Travel', emoji: '🚗', isDefault: true, displayOrder: 2, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-shopping', name: 'Shopping', emoji: '🛍️', isDefault: true, displayOrder: 3, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-health', name: 'Health', emoji: '💊', isDefault: true, displayOrder: 4, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-entertainment', name: 'Entertainment', emoji: '🎬', isDefault: true, displayOrder: 5, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-bills', name: 'Bills', emoji: '🧾', isDefault: true, displayOrder: 6, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-sports', name: 'Sports', emoji: '🏸', isDefault: true, displayOrder: 7, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-education', name: 'Education', emoji: '📚', isDefault: true, displayOrder: 8, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-salary', name: 'Salary', emoji: '💰', isDefault: true, displayOrder: 9, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-freelance', name: 'Freelance', emoji: '💻', isDefault: true, displayOrder: 10, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-other', name: 'Other', emoji: '📦', isDefault: true, displayOrder: 11, archived: false, createdAt: Date.now(), updatedAt: Date.now() },
]

const DEFAULT_SETTINGS: Partial<Settings> = {
  reminderTime: '21:00',
  reminderEnabled: true,
  lastReminderShownDate: '',
  pinEnabled: false,
  pinHash: null,
  biometricEnabled: false,
  biometricCredentialId: null,
  lastBackupAt: 0,
  emailBackupEnabled: false,
  emailBackupAddress: '',
  emailBackupDay: 0,
  emailBackupTime: '21:00',
  lastEmailBackupAt: 0,
  multiCategoryMode: 'each',
  firstLaunchCompleted: false,
  chatMemoryEnabled: true,
  chatIdleTimeoutMinutes: 10,
  lastChatClearedAt: 0,
  quickAddAutoDetect: true,
  quickAddMaxTiles: 6,
  bulkEntryAutoDetect: true,
  tagSuggestionsEnabled: true,
  appOpenCount: 0,
  installPromptDismissed: false,
  notificationPermission: 'default',
  notificationDailyEnabled: true,
  notificationBudgetEnabled: true,
  notificationPendingEnabled: true,
  notificationBackupEnabled: true,
  notificationRecurringEnabled: true,
  lastBudgetNotificationDate: '',
  lastPendingNotificationDate: '',
  lastBackupNotificationDate: '',
  lastRecurringNotificationDate: '',
  lastInsightRefreshAt: 0,
  reportDefaultPeriod: 'this_month',
  preferredCurrency: 'INR',
  monthlyIncomeEstimate: 0,
  monthlySavingsTarget: 0,
  financialGoals: [],
  syncEnabled: false,
  syncProvider: 'googleDrive',
  syncDriveFileId: null,
  syncDeviceId: '',
  syncDeviceName: '',
  lastSyncAt: 0,
  lastSyncStatus: 'idle',
  lastSyncError: '',
  autoSyncEnabled: true,
  autoSyncIntervalMinutes: 15,
  syncConflictCount: 0,
  syncInProgress: false,
}

export const SYNCABLE_STORE_NAMES = [
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
  'chatHistory',
  'settings',
] as const

export type SyncableStoreName = (typeof SYNCABLE_STORE_NAMES)[number]

const makeQuickQuestionDefaults = (): QuickQuestion[] => {
  const now = new Date()
  const today = getTodayString()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)
  const weekStartString = formatLocalDateString(weekStart)
  const createdAt = Date.now()

  return [
    {
      id: 'quick-question-month-spend',
      question: 'How much did I spend this month?',
      operation: 'sum',
      filters: {
        type: 'expense',
        categoryIds: null,
        paymentMethods: null,
        tags: null,
        dateFrom: monthStart,
        dateTo: today,
        search: null,
      },
      displayMode: 'inline',
      naturalContext: 'Total expenses this month',
      enabled: true,
      displayOrder: 1,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'quick-question-food-month',
      question: 'Show food expenses this month',
      operation: 'list',
      filters: {
        type: 'expense',
        categoryIds: ['cat-food'],
        paymentMethods: null,
        tags: null,
        dateFrom: monthStart,
        dateTo: today,
        search: null,
      },
      displayMode: 'navigate',
      naturalContext: 'Food expenses this month',
      enabled: true,
      displayOrder: 2,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'quick-question-biggest-week',
      question: 'What was my biggest expense this week?',
      operation: 'max',
      filters: {
        type: 'expense',
        categoryIds: null,
        paymentMethods: null,
        tags: null,
        dateFrom: weekStartString,
        dateTo: today,
        search: null,
      },
      displayMode: 'inline',
      naturalContext: 'Biggest expense this week',
      enabled: true,
      displayOrder: 3,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'quick-question-budget',
      question: 'Am I over budget?',
      operation: 'budget_check',
      filters: {
        type: 'expense',
        categoryIds: null,
        paymentMethods: null,
        tags: null,
        dateFrom: monthStart,
        dateTo: today,
        search: null,
      },
      displayMode: 'inline',
      naturalContext: 'Overall monthly budget status',
      enabled: true,
      displayOrder: 4,
      createdAt,
      updatedAt: createdAt,
    },
  ]
}

// ─── Open DB ─────────────────────────────────────────────────
let dbInstance: IDBPDatabase<ExpenseTrackerDB> | null = null
let syncMutationSuppressed = false
let mutationNotifySuppressed = false

export function setSyncMutationSuppressed(value: boolean): void {
  syncMutationSuppressed = value
}

export function setMutationNotifySuppressed(value: boolean): void {
  mutationNotifySuppressed = value
}

function notifyDataMutated(): void {
  if (mutationNotifySuppressed) return
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('expense-data-mutated'))
}

function isSyncRuntimeSetting(key: keyof Settings): boolean {
  return [
    'syncEnabled',
    'syncProvider',
    'syncDriveFileId',
    'syncDeviceId',
    'syncDeviceName',
    'lastSyncAt',
    'lastSyncStatus',
    'lastSyncError',
    'autoSyncEnabled',
    'autoSyncIntervalMinutes',
    'syncConflictCount',
    'syncInProgress',
  ].includes(key)
}

async function getSyncDeviceIdForTombstone(): Promise<string> {
  const stored = await getSetting('syncDeviceId')
  if (stored) return stored
  const generated = uuidv4()
  await setSetting('syncDeviceId', generated)
  return generated
}

export async function markDeleted(
  storeName: SyncableStoreName,
  recordKey: string,
  deletedAt = Date.now()
): Promise<void> {
  if (syncMutationSuppressed) return
  const db = await getDB()
  const deviceId = await getSyncDeviceIdForTombstone()
  await db.put('syncTombstones', {
    id: `${storeName}:${recordKey}`,
    storeName,
    recordKey,
    deletedAt,
    deviceId,
  })
}

export async function getSyncTombstones(): Promise<SyncTombstone[]> {
  const db = await getDB()
  return db.getAllFromIndex('syncTombstones', 'by-deletedAt')
}

export async function putSyncTombstone(tombstone: SyncTombstone): Promise<void> {
  const db = await getDB()
  await db.put('syncTombstones', tombstone)
}

export async function addSyncConflict(conflict: Omit<SyncConflict, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDB()
  await db.put('syncConflicts', {
    ...conflict,
    id: uuidv4(),
    createdAt: Date.now(),
  })
}

export async function putSyncConflict(conflict: SyncConflict): Promise<void> {
  const db = await getDB()
  await db.put('syncConflicts', conflict)
}

export async function getSyncConflicts(limit = 20): Promise<SyncConflict[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('syncConflicts', 'by-createdAt')
  return all.reverse().slice(0, limit)
}

export async function clearSyncConflicts(): Promise<void> {
  const db = await getDB()
  await db.clear('syncConflicts')
  await setSetting('syncConflictCount', 0)
}

type LooseDB = {
  getAll(storeName: string): Promise<unknown[]>
  put(storeName: string, value: unknown): Promise<unknown>
  delete(storeName: string, key: string): Promise<void>
  clear(storeName: string): Promise<void>
}

export async function getAllFromSyncStore(storeName: SyncableStoreName): Promise<unknown[]> {
  const db = await getDB()
  return (db as unknown as LooseDB).getAll(storeName)
}

export async function putIntoSyncStore(storeName: SyncableStoreName, value: unknown): Promise<void> {
  const db = await getDB()
  await (db as unknown as LooseDB).put(storeName, value)
}

export async function deleteFromSyncStore(storeName: SyncableStoreName, key: string): Promise<void> {
  const db = await getDB()
  await (db as unknown as LooseDB).delete(storeName, key)
}

export async function getDB(): Promise<IDBPDatabase<ExpenseTrackerDB>> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in the browser')
  }

  if (dbInstance) return dbInstance
  dbInstance = await openDB<ExpenseTrackerDB>('expenseTrackerDB', 6, {
    upgrade(db) {
      // ── entries ──
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' })
        entries.createIndex('by-date', 'date')
        entries.createIndex('by-type', 'type')
        entries.createIndex('by-createdAt', 'createdAt')
        entries.createIndex('by-category', 'categoryIds', { multiEntry: true })
        entries.createIndex('by-tag', 'tags', { multiEntry: true })
        entries.createIndex('by-source', 'source')
        entries.createIndex('by-pending', 'pending')
      }

      // ── categories ──
      if (!db.objectStoreNames.contains('categories')) {
        const categories = db.createObjectStore('categories', { keyPath: 'id' })
        categories.createIndex('by-displayOrder', 'displayOrder')
      }

      // ── tags ──
      if (!db.objectStoreNames.contains('tags')) {
        const tags = db.createObjectStore('tags', { keyPath: 'name' })
        tags.createIndex('by-usageCount', 'usageCount')
        tags.createIndex('by-lastUsedAt', 'lastUsedAt')
      }

      // ── budgets ──
      if (!db.objectStoreNames.contains('budgets')) {
        const budgets = db.createObjectStore('budgets', { keyPath: 'id' })
        budgets.createIndex('by-categoryId', 'categoryId')
      }

      // ── reconciliationChecks ──
      if (!db.objectStoreNames.contains('reconciliationChecks')) {
        const checks = db.createObjectStore('reconciliationChecks', { keyPath: 'id' })
        checks.createIndex('by-month', 'month')
        checks.createIndex('by-createdAt', 'createdAt')
      }

      // ── lentBorrowed ──
      if (!db.objectStoreNames.contains('lentBorrowed')) {
        const lb = db.createObjectStore('lentBorrowed', { keyPath: 'id' })
        lb.createIndex('by-settled', 'settled')
        lb.createIndex('by-counterparty', 'counterparty')
        lb.createIndex('by-direction', 'direction')
      }

      // ── corrections ──
      if (!db.objectStoreNames.contains('corrections')) {
        const corrections = db.createObjectStore('corrections', { keyPath: 'id' })
        corrections.createIndex('by-createdAt', 'createdAt')
      }

      // ── quickAddTiles ──
      if (!db.objectStoreNames.contains('quickAddTiles')) {
        const tiles = db.createObjectStore('quickAddTiles', { keyPath: 'id' })
        tiles.createIndex('by-displayOrder', 'displayOrder')
        tiles.createIndex('by-usageCount', 'usageCount')
      }

      if (!db.objectStoreNames.contains('quickQuestions')) {
        const questions = db.createObjectStore('quickQuestions', { keyPath: 'id' })
        questions.createIndex('by-displayOrder', 'displayOrder')
      }

      if (!db.objectStoreNames.contains('recurringRules')) {
        const rules = db.createObjectStore('recurringRules', { keyPath: 'id' })
        rules.createIndex('by-nextDueDate', 'nextDueDate')
      }

      // ── chatHistory ──
      if (!db.objectStoreNames.contains('chatHistory')) {
        const chat = db.createObjectStore('chatHistory', { keyPath: 'id' })
        chat.createIndex('by-createdAt', 'createdAt')
      }

      // ── settings ──
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }

      if (!db.objectStoreNames.contains('syncTombstones')) {
        const tombstones = db.createObjectStore('syncTombstones', { keyPath: 'id' })
        tombstones.createIndex('by-deletedAt', 'deletedAt')
        tombstones.createIndex('by-storeName', 'storeName')
      }

      if (!db.objectStoreNames.contains('syncConflicts')) {
        const conflicts = db.createObjectStore('syncConflicts', { keyPath: 'id' })
        conflicts.createIndex('by-createdAt', 'createdAt')
        conflicts.createIndex('by-storeName', 'storeName')
      }
    },

    async blocked() {
      console.warn('DB upgrade blocked — close other tabs')
    },
  })

  await seedDefaultData(dbInstance)
  return dbInstance
}

// ─── Seed defaults on first open ────────────────────────────
async function seedDefaultData(db: IDBPDatabase<ExpenseTrackerDB>) {
  // Seed categories if empty
  const categoryCount = await db.count('categories')
  if (categoryCount === 0) {
    const tx = db.transaction('categories', 'readwrite')
    await Promise.all(DEFAULT_CATEGORIES.map(c => tx.store.put(c)))
    await tx.done
  }

  // Seed settings if empty
  const settingsCount = await db.count('settings')
  if (settingsCount === 0) {
    const tx = db.transaction('settings', 'readwrite')
    await Promise.all(
      Object.entries(DEFAULT_SETTINGS).map(([key, value]) =>
        tx.store.put({ key, value, updatedAt: Date.now() })
      )
    )
    await tx.done
  } else {
    await Promise.all(
      Object.entries(DEFAULT_SETTINGS).map(async ([key, value]) => {
        const existing = await db.get('settings', key)
        if (!existing) await db.put('settings', { key, value, updatedAt: Date.now() })
      })
    )
  }

  const quickQuestionCount = await db.count('quickQuestions')
  if (quickQuestionCount === 0) {
    const tx = db.transaction('quickQuestions', 'readwrite')
    await Promise.all(makeQuickQuestionDefaults().map((question) => tx.store.put(question)))
    await tx.done
  }
}

// ─── Settings helpers ────────────────────────────────────────
export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K] | undefined> {
  const db = await getDB()
  const record = await db.get('settings', key)
  return record?.value as Settings[K] | undefined
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const db = await getDB()
  await db.put('settings', { key, value, updatedAt: Date.now() })
  if (!isSyncRuntimeSetting(key)) notifyDataMutated()
}

export async function clearAllAppData(): Promise<void> {
  const db = await getDB()
  const storeNames = [
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
    'chatHistory',
    'settings',
    'syncTombstones',
    'syncConflicts',
  ] as const

  for (const storeName of storeNames) {
    await db.clear(storeName)
  }

  await seedDefaultData(db)
}

// ─── Categories helpers ──────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  const db = await getDB()
  return db.getAllFromIndex('categories', 'by-displayOrder')
}

export async function getCategoryById(id: string): Promise<Category | undefined> {
  const db = await getDB()
  return db.get('categories', id)
}
// ─── Entry helpers ───────────────────────────────────────────
export async function addEntry(entry: Entry): Promise<void> {
  const db = await getDB()
  await db.put('entries', entry)
  notifyDataMutated()

  if (entry.pending) return

  // Sync tags store
  for (const tag of entry.tags) {
    await upsertTag(tag)
  }

  // Run quick-add auto detection
  await runQuickAddAutoDetect()
}
export async function getEntriesByDate(date: string): Promise<Entry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'by-date', date)
  return all.filter((e) => !e.pending)
}

export async function getEntriesInRange(
  startDate: string,
  endDate: string
): Promise<Entry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'by-date')
  return all.filter((e) => !e.pending && e.date >= startDate && e.date <= endDate)
}

export async function getRecentEntries(limit = 10): Promise<Entry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'by-createdAt')
  return all.filter((e) => !e.pending).reverse().slice(0, limit)
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB()
  const entry = await db.get('entries', id)
  if (entry) {
    for (const tag of entry.tags) {
      await decrementTag(tag)
    }
  }
  await db.delete('entries', id)
  await markDeleted('entries', id)
  notifyDataMutated()
}

export async function updateEntry(entry: Entry, previousTags?: string[]): Promise<void> {
  const db = await getDB()
  const existing = await db.get('entries', entry.id)
  await updateEntryTags(previousTags ?? existing?.tags ?? [], entry.tags)
  await db.put('entries', entry)
  notifyDataMutated()
}

// ─── Pending offline log helpers ─────────────────────────────
export async function addPendingLog(rawInput: string): Promise<Entry> {
  const db = await getDB()
  const now = Date.now()
  const entry: Entry = {
    id: uuidv4(),
    type: 'expense',
    amount: 0,
    categoryIds: ['cat-other'],
    paymentMethod: DEFAULT_PAYMENT_METHOD,
    tags: [],
    date: getTodayString(),
    note: rawInput.slice(0, 100),
    rawInput,
    confidence: 'low',
    source: 'ai',
    bulkBatchId: null,
    pending: true,
    pendingStatus: 'pending',
    pendingError: null,
    pendingRetryAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.put('entries', entry)
  notifyDataMutated()
  return entry
}

export async function getPendingEntries(): Promise<Entry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'by-createdAt')
  return all.filter((e) => e.pending).reverse()
}

export async function updatePendingLogStatus(
  id: string,
  status: NonNullable<Entry['pendingStatus']>,
  error: string | null = null
): Promise<void> {
  const db = await getDB()
  const entry = await db.get('entries', id)
  if (!entry?.pending) return
  const now = Date.now()
  await db.put('entries', {
    ...entry,
    pendingStatus: status,
    pendingError: error,
    pendingRetryAt: status === 'retrying' ? now : entry.pendingRetryAt ?? null,
    updatedAt: now,
  })
  notifyDataMutated()
}

export async function clearFailedPendingLogs(): Promise<number> {
  const pending = await getPendingEntries()
  const failed = pending.filter((entry) => entry.pendingStatus === 'failed')
  await Promise.all(failed.map((entry) => deletePendingLog(entry.id)))
  return failed.length
}

export async function deletePendingLog(id: string): Promise<void> {
  const db = await getDB()
  const entry = await db.get('entries', id)
  if (!entry?.pending) return
  await db.delete('entries', id)
  await markDeleted('entries', id)
  notifyDataMutated()
}

// ─── Corrections helpers ─────────────────────────────────────
export async function getRecentCorrections(limit = 10): Promise<Correction[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('corrections', 'by-createdAt')
  return all.reverse().slice(0, limit)
}

export async function addCorrection(correction: Correction): Promise<void> {
  const db = await getDB()
  const count = await db.count('corrections')
  if (count >= 100) {
    // Delete oldest
    const all = await db.getAllFromIndex('corrections', 'by-createdAt')
    await db.delete('corrections', all[0].id)
    await markDeleted('corrections', all[0].id)
  }
  await db.put('corrections', correction)
  notifyDataMutated()
}
// ─── Budget helpers ──────────────────────────────────────────
export async function getBudgets(): Promise<Budget[]> {
  const db = await getDB()
  return db.getAll('budgets')
}

export async function setBudget(budget: Budget): Promise<void> {
  const db = await getDB()
  await db.put('budgets', budget)
  notifyDataMutated()
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('budgets', id)
  await markDeleted('budgets', id)
  notifyDataMutated()
}

export async function getBudgetByCategoryId(
  categoryId: string
): Promise<Budget | undefined> {
  const db = await getDB()
  const all = await db.getAllFromIndex('budgets', 'by-categoryId', categoryId)
  return all[0]
}

// ─── Reconciliation helpers ─────────────────────────────────
export async function getReconciliationChecks(): Promise<ReconciliationCheck[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('reconciliationChecks', 'by-createdAt')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getLatestReconciliationCheck(
  month: string
): Promise<ReconciliationCheck | undefined> {
  const db = await getDB()
  const checks = await db.getAllFromIndex('reconciliationChecks', 'by-month', month)
  return checks.sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

export async function saveReconciliationCheck(
  check: Omit<ReconciliationCheck, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string
    createdAt?: number
  }
): Promise<ReconciliationCheck> {
  const db = await getDB()
  const now = Date.now()
  const record: ReconciliationCheck = {
    ...check,
    id: check.id ?? uuidv4(),
    createdAt: check.createdAt ?? now,
    updatedAt: now,
  }
  await db.put('reconciliationChecks', record)
  notifyDataMutated()
  return record
}
// ─── History helpers ─────────────────────────────────────────
export async function getAllEntries(): Promise<Entry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'by-createdAt')
  return all.filter((e) => !e.pending).reverse()
}

export async function getEntriesByCategory(categoryId: string): Promise<Entry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'by-category', categoryId)
  return all.filter((e) => !e.pending)
}

// ─── Tag helpers ─────────────────────────────────────────────
export async function getTagSuggestions(
  prefix: string,
  limit = 10
): Promise<Tag[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('tags', 'by-usageCount')
  const sorted = all.reverse()
  if (!prefix) return sorted.slice(0, limit)
  return sorted
    .filter((t) => t.name.startsWith(prefix.toLowerCase().replace(/^#/, '')))
    .slice(0, limit)
}

export async function upsertTag(name: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('tags', name)
  const now = Date.now()
  if (existing) {
    await db.put('tags', {
      ...existing,
      usageCount: existing.usageCount + 1,
      lastUsedAt: now,
    })
  } else {
    await db.put('tags', {
      name,
      usageCount: 1,
      firstUsedAt: now,
      lastUsedAt: now,
      color: null,
    })
  }
  notifyDataMutated()
}

export async function decrementTag(name: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('tags', name)
  if (!existing) return
  await db.put('tags', {
    ...existing,
    usageCount: Math.max(0, existing.usageCount - 1),
  })
  notifyDataMutated()
}

export async function getAllTags(): Promise<Tag[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('tags', 'by-usageCount')
  return all.reverse()
}

export async function renameTag(oldName: string, newName: string): Promise<void> {
  const normalized = normalizeTag(newName)
  if (!normalized) throw new Error('Invalid tag name')

  const db = await getDB()

  // Update master tag record
  const existing = await db.get('tags', oldName)
  if (existing) {
    await db.delete('tags', oldName)
    await markDeleted('tags', oldName)
    await db.put('tags', { ...existing, name: normalized })
  }

  // Bulk update all entries
  const allEntries = await db.getAll('entries')
  const tx = db.transaction('entries', 'readwrite')
  for (const entry of allEntries) {
    if (entry.tags.includes(oldName)) {
      const newTags = entry.tags.map((t) => (t === oldName ? normalized : t))
      tx.store.put({ ...entry, tags: newTags, updatedAt: Date.now() })
    }
  }
  await tx.done
  notifyDataMutated()
}

export async function deleteTag(name: string): Promise<void> {
  const db = await getDB()

  // Soft delete — set usageCount to 0
  const existing = await db.get('tags', name)
  if (existing) {
    await db.put('tags', { ...existing, usageCount: 0 })
    notifyDataMutated()
  }

  // Remove all entries
  const allEntries = await db.getAll('entries')
  const tx = db.transaction('entries', 'readwrite')
  for (const entry of allEntries) {
    if (entry.tags.includes(name)) {
      const newTags = entry.tags.filter((t) => t !== name)
      tx.store.put({ ...entry, tags: newTags, updatedAt: Date.now() })
    }
  }
  await tx.done
}
// ─── QuickAdd helpers ────────────────────────────────────────
export async function getQuickAddTiles(limit = 6): Promise<QuickAddTile[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('quickAddTiles', 'by-displayOrder')
  return all.slice(0, limit)
}

export async function upsertQuickAddTile(tile: QuickAddTile): Promise<void> {
  const db = await getDB()
  await db.put('quickAddTiles', tile)
  notifyDataMutated()
}

export async function deleteQuickAddTile(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('quickAddTiles', id)
  await markDeleted('quickAddTiles', id)
  notifyDataMutated()
}

// ─── Quick Question helpers ─────────────────────────────────
export async function getQuickQuestions(options: { enabledOnly?: boolean } = {}): Promise<QuickQuestion[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('quickQuestions', 'by-displayOrder')
  return options.enabledOnly ? all.filter((question) => question.enabled) : all
}

export async function saveQuickQuestion(question: QuickQuestion): Promise<void> {
  const db = await getDB()
  await db.put('quickQuestions', { ...question, updatedAt: Date.now() })
  notifyDataMutated()
}

export async function deleteQuickQuestion(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('quickQuestions', id)
  await markDeleted('quickQuestions', id)
  notifyDataMutated()
}

export async function reorderQuickQuestions(questions: QuickQuestion[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('quickQuestions', 'readwrite')
  const now = Date.now()
  questions.forEach((question, index) => {
    tx.store.put({ ...question, displayOrder: index + 1, updatedAt: now })
  })
  await tx.done
  notifyDataMutated()
}

// ─── Recurring rule helpers ─────────────────────────────────
export async function getRecurringRules(): Promise<RecurringRule[]> {
  const db = await getDB()
  const rules = await db.getAllFromIndex('recurringRules', 'by-nextDueDate')
  return rules.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
}

export async function saveRecurringRule(rule: RecurringRule): Promise<void> {
  const db = await getDB()
  await db.put('recurringRules', rule)
  notifyDataMutated()
}

export async function deleteRecurringRule(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('recurringRules', id)
  await markDeleted('recurringRules', id)
  notifyDataMutated()
}

export async function getDueRecurringRules(today: string): Promise<RecurringRule[]> {
  const db = await getDB()
  const rules = await db.getAllFromIndex('recurringRules', 'by-nextDueDate')
  return rules
    .filter((rule) =>
      rule.enabled &&
      rule.nextDueDate <= today &&
      rule.lastPromptedDueDate !== rule.nextDueDate
    )
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
}

export async function markRecurringRulePrompted(rule: RecurringRule): Promise<void> {
  await saveRecurringRule({
    ...rule,
    lastPromptedDueDate: rule.nextDueDate,
    updatedAt: Date.now(),
  })
}

function addMonths(date: Date, months: number) {
  const day = date.getDate()
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  if (next.getDate() < day) next.setDate(0)
  return next
}

function toDateString(date: Date): string {
  return formatLocalDateString(date)
}

export async function advanceRecurringRule(rule: RecurringRule): Promise<void> {
  const due = new Date(`${rule.nextDueDate}T00:00:00`)
  const interval = Math.max(1, rule.interval)
  const nextDate =
    rule.frequency === 'daily'
      ? new Date(due.getTime() + interval * 24 * 60 * 60 * 1000)
      : rule.frequency === 'weekly'
      ? new Date(due.getTime() + interval * 7 * 24 * 60 * 60 * 1000)
      : addMonths(due, interval)

  await saveRecurringRule({
    ...rule,
    nextDueDate: toDateString(nextDate),
    lastPromptedDueDate: null,
    updatedAt: Date.now(),
  })
}

export async function runQuickAddAutoDetect(): Promise<void> {
  const db = await getDB()

  // Get setting
  const autoDetect = await getSetting('quickAddAutoDetect')
  if (autoDetect === false) return

  // Get last 30 days entries
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const startDate = formatLocalDateString(thirtyDaysAgo)
  const endDate = getTodayString()

  const allEntries = await db.getAllFromIndex('entries', 'by-date')
  const recentEntries = allEntries.filter(
    (e) => !e.pending && e.date >= startDate && e.date <= endDate && e.type === 'expense'
  )

  // Group by combo key: amount + sorted categoryIds
  const comboCounts: Record<string, {
    count: number
    amount: number
    categoryIds: string[]
    note: string
    tags: string[]
  }> = {}

  for (const entry of recentEntries) {
    const key = `${entry.amount}__${[...entry.categoryIds].sort().join('_')}`
    if (!comboCounts[key]) {
      comboCounts[key] = {
        count: 0,
        amount: entry.amount,
        categoryIds: entry.categoryIds,
        note: entry.note,
        tags: entry.tags,
      }
    }
    comboCounts[key].count++
  }

  // Get existing auto tiles
  const existingTiles = await db.getAll('quickAddTiles')
  const autoTiles = existingTiles.filter((t) => !t.pinnedManually)

  // Remove auto tiles with no recent matches
  for (const tile of autoTiles) {
    const key = `${tile.amount}__${[...tile.categoryIds].sort().join('_')}`
    if (!comboCounts[key] || comboCounts[key].count < 3) {
      await db.delete('quickAddTiles', tile.id)
    }
  }

  // Add new tiles for combos with 3+ matches
  const maxOrder = existingTiles.length > 0
    ? Math.max(...existingTiles.map((t) => t.displayOrder))
    : 0

  let orderCounter = maxOrder + 1

  for (const [key, combo] of Object.entries(comboCounts)) {
    if (combo.count < 3) continue

    // Check if tile already exists for this combo
    const exists = existingTiles.some(
      (t) => `${t.amount}__${[...t.categoryIds].sort().join('_')}` === key
    )
    if (exists) continue

    // Get category name for label
    const cats = await db.getAll('categories')
    const firstCat = cats.find((c) => c.id === combo.categoryIds[0])

    const tile: QuickAddTile = {
      id: uuidv4(),
      amount: combo.amount,
      amountMode: 'edit',
      categoryIds: combo.categoryIds,
      tags: combo.tags,
      note: combo.note,
      displayLabel: firstCat?.name ?? 'Expense',
      emoji: firstCat?.emoji ?? '📦',
      pinnedManually: false,
      usageCount: combo.count,
      lastUsedAt: Date.now(),
      displayOrder: orderCounter++,
      createdAt: Date.now(),
    }
    await db.put('quickAddTiles', tile)
  }

  // Cap at maxTiles — hide extras (keep in db, just cap display)
  const maxTiles = (await getSetting('quickAddMaxTiles')) ?? 6
  const allTiles = await db.getAllFromIndex('quickAddTiles', 'by-usageCount')
  const sorted = allTiles.reverse().slice(0, maxTiles)

  // Re-assign displayOrder based on usageCount rank
  const tx = db.transaction('quickAddTiles', 'readwrite')
  for (let i = 0; i < sorted.length; i++) {
    tx.store.put({ ...sorted[i], displayOrder: i + 1 })
  }
  await tx.done
}

// Import uuidv4 at the top of db.ts if not already there
export async function updateEntryTags(
  oldTags: string[],
  newTags: string[]
): Promise<void> {
  // Decrement removed tags
  for (const tag of oldTags) {
    if (!newTags.includes(tag)) {
      await decrementTag(tag)
    }
  }
  // Upsert added tags
  for (const tag of newTags) {
    if (!oldTags.includes(tag)) {
      await upsertTag(tag)
    }
  }
}
// ─── Chat history helpers ────────────────────────────────────
export async function addChatMessage(message: ChatMessage): Promise<void> {
  const db = await getDB()
  await db.put('chatHistory', message)
  notifyDataMutated()

  // Prune to last 10 messages
  const all = await db.getAllFromIndex('chatHistory', 'by-createdAt')
  if (all.length > 10) {
    const toDelete = all.slice(0, all.length - 10)
    for (const msg of toDelete) {
      await db.delete('chatHistory', msg.id)
      await markDeleted('chatHistory', msg.id)
    }
  }
}

export async function getChatHistory(limit = 10): Promise<ChatMessage[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('chatHistory', 'by-createdAt')
  return all.slice(-limit)
}

export async function clearChatHistory(): Promise<void> {
  const db = await getDB()
  const all = await db.getAll('chatHistory')
  for (const msg of all) {
    await db.delete('chatHistory', msg.id)
    await markDeleted('chatHistory', msg.id)
  }
  notifyDataMutated()
}
// ─── Lent/Borrowed helpers ───────────────────────────────────
export async function getLentBorrowed(): Promise<LentBorrowed[]> {
  const db = await getDB()
  const all = await db.getAll('lentBorrowed')
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function addLentBorrowed(record: LentBorrowed): Promise<void> {
  const db = await getDB()
  await db.put('lentBorrowed', record)
  notifyDataMutated()
}

export async function updateLentBorrowed(record: LentBorrowed): Promise<void> {
  const db = await getDB()
  await db.put('lentBorrowed', record)
  notifyDataMutated()
}

export async function deleteLentBorrowed(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('lentBorrowed', id)
  await markDeleted('lentBorrowed', id)
  notifyDataMutated()
}
