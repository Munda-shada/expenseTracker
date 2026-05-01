// ─── Entries ────────────────────────────────────────────────
export type EntryType = 'expense' | 'income'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type EntrySource = 'ai' | 'manual' | 'quickAdd' | 'bulk'

export interface Entry {
  id: string
  type: EntryType
  amount: number
  categoryIds: string[]
  tags: string[]
  date: string           // YYYY-MM-DD
  note: string
  rawInput: string
  confidence: ConfidenceLevel
  source: EntrySource
  bulkBatchId: string | null
  pending: boolean
  pendingStatus?: 'pending' | 'retrying' | 'parsed' | 'failed'
  pendingError?: string | null
  pendingRetryAt?: number | null
  createdAt: number      // Unix ms
  updatedAt: number      // Unix ms
}

// ─── Categories ─────────────────────────────────────────────
export interface Category {
  id: string
  name: string
  emoji: string
  isDefault: boolean
  displayOrder: number
  archived: boolean
  createdAt: number
  updatedAt: number
}

// ─── Tags ───────────────────────────────────────────────────
export interface Tag {
  name: string           // Primary key
  usageCount: number
  firstUsedAt: number
  lastUsedAt: number
  color: string | null
}

// ─── Budgets ────────────────────────────────────────────────
export interface Budget {
  id: string
  categoryId: string | 'overall'
  monthlyLimit: number
  createdAt: number
  updatedAt: number
}

// ─── Goals / planning ──────────────────────────────────────
export interface FinancialGoal {
  id: string
  name: string
  targetAmount: number
  savedAmount: number
  monthlyTarget: number
  emoji: string
  createdAt: number
  updatedAt: number
}

// ─── Reconciliation ─────────────────────────────────────────
export interface ReconciliationCheck {
  id: string
  month: string
  openingBalance: number
  closingBalance: number
  expectedBalance: number
  difference: number
  note: string
  createdAt: number
  updatedAt: number
}

// ─── Lent / Borrowed ────────────────────────────────────────
export type LentBorrowedDirection = 'lent' | 'borrowed'

export interface LentBorrowed {
  id: string
  direction: LentBorrowedDirection
  counterparty: string
  amount: number
  date: string
  note: string
  settled: boolean
  settledDate: string | null
  createdAt: number
  updatedAt: number
}

// ─── Corrections ────────────────────────────────────────────
export interface Correction {
  id: string
  rawInput: string
  aiOutput: object
  userCorrected: object
  correctedFields: string[]
  createdAt: number
}

// ─── Quick add Tiles ────────────────────────────────────────
export type QuickAddAmountMode = 'fixed' | 'edit'

export interface QuickAddTile {
  id: string
  amount: number
  amountMode?: QuickAddAmountMode
  categoryIds: string[]
  tags: string[]
  note: string
  displayLabel: string
  emoji: string
  pinnedManually: boolean
  usageCount: number
  lastUsedAt: number
  displayOrder: number
  createdAt: number
}

// ─── Quick Questions ───────────────────────────────────────
export type QuickQuestionOperation = 'sum' | 'count' | 'list' | 'average' | 'max' | 'budget_check'

export interface QuickQuestionFilter {
  type: 'expense' | 'income' | 'all'
  categoryIds: string[] | null
  tags: string[] | null
  dateFrom: string | null
  dateTo: string | null
  search: string | null
}

export interface QuickQuestion {
  id: string
  question: string
  operation: QuickQuestionOperation
  filters: QuickQuestionFilter
  displayMode: 'inline' | 'navigate'
  naturalContext: string
  enabled: boolean
  displayOrder: number
  createdAt: number
  updatedAt: number
}

// ─── Recurring Rules ────────────────────────────────────────
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly'

export interface RecurringRule {
  id: string
  entryTemplate: {
    type: EntryType
    amount: number
    categoryIds: string[]
    tags: string[]
    note: string
  }
  frequency: RecurringFrequency
  interval: number
  nextDueDate: string
  enabled: boolean
  lastPromptedDueDate: string | null
  createdAt: number
  updatedAt: number
}

// ─── Chat history ───────────────────────────────────────────
export type ChatRole = 'user' | 'assistant'
export type ChatIntent = 'log' | 'query' | 'unclear' | null
export type DisplayMode = 'inline' | 'navigate' | null

export interface ChatMessage {
  id: string
  role: ChatRole
  message: string
  intent: ChatIntent
  parsedQuery: object | null
  result: object | null
  displayMode: DisplayMode
  createdAt: number
}

// ─── Settings ───────────────────────────────────────────────
export interface Settings {
  reminderTime: string
  reminderEnabled: boolean
  lastReminderShownDate: string
  pinEnabled: boolean
  pinHash: string | null
  biometricEnabled: boolean
  biometricCredentialId: string | null
  lastBackupAt: number
  emailBackupEnabled: boolean
  emailBackupAddress: string
  emailBackupDay: number
  emailBackupTime: string
  lastEmailBackupAt: number
  multiCategoryMode: 'each' | 'split'
  firstLaunchCompleted: boolean
  chatMemoryEnabled: boolean
  chatIdleTimeoutMinutes: number
  lastChatClearedAt: number
  quickAddAutoDetect: boolean
  quickAddMaxTiles: number
  bulkEntryAutoDetect: boolean
  tagSuggestionsEnabled: boolean
  appOpenCount: number
  installPromptDismissed: boolean
  notificationPermission: 'unsupported' | 'default' | 'granted' | 'denied'
  notificationDailyEnabled: boolean
  notificationBudgetEnabled: boolean
  notificationPendingEnabled: boolean
  notificationBackupEnabled: boolean
  notificationRecurringEnabled: boolean
  lastBudgetNotificationDate: string
  lastPendingNotificationDate: string
  lastBackupNotificationDate: string
  lastRecurringNotificationDate: string
  lastInsightRefreshAt: number
  reportDefaultPeriod: 'this_month' | 'last_month'
  preferredCurrency: 'INR' | 'USD' | 'EUR' | 'GBP'
  monthlyIncomeEstimate: number
  monthlySavingsTarget: number
  financialGoals: FinancialGoal[]
  syncEnabled: boolean
  syncProvider: 'googleDrive'
  syncDriveFileId: string | null
  syncDeviceId: string
  syncDeviceName: string
  lastSyncAt: number
  lastSyncStatus: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncError: string
  autoSyncEnabled: boolean
  autoSyncIntervalMinutes: number
  syncConflictCount: number
  syncInProgress: boolean
}

// ─── Cloud sync ─────────────────────────────────────────────
export interface SyncTombstone {
  id: string
  storeName: string
  recordKey: string
  deletedAt: number
  deviceId: string
}

export interface SyncConflict {
  id: string
  storeName: string
  recordKey: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  winner: 'local' | 'remote'
  createdAt: number
}
