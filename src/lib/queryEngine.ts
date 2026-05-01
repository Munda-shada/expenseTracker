import {
  getEntriesInRange,
  getAllEntries,
  getCategories,
  getBudgets,
} from './db'
import { Entry, PaymentMethod, getPaymentMethodLabel } from './types'
import { getTodayString } from './utils'

export interface QueryFilter {
  type: 'expense' | 'income' | 'all'
  categoryIds: string[] | null
  paymentMethods: PaymentMethod[] | null
  tags: string[] | null
  dateFrom: string | null
  dateTo: string | null
  search: string | null
}

export interface QueryResult {
  operation: string
  total?: number
  count?: number
  average?: number
  max?: Entry | null
  entries?: Entry[]
  budgetLimit?: number
  budgetUsed?: number
  budgetPercent?: number
  isEmpty: boolean
}

export async function runQuery(
  operation: string,
  filters: QueryFilter
): Promise<QueryResult> {
  // Get entries in date range
  let entries: Entry[] = []

  if (filters.dateFrom && filters.dateTo) {
    entries = await getEntriesInRange(filters.dateFrom, filters.dateTo)
  } else if (filters.dateFrom) {
    const today = getTodayString()
    entries = await getEntriesInRange(filters.dateFrom, today)
  } else {
    entries = await getAllEntries()
  }

  // Apply type filter
  if (filters.type !== 'all') {
    entries = entries.filter((e) => e.type === filters.type)
  }

  // Apply category filter
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    entries = entries.filter((e) =>
      filters.categoryIds!.some((id) => e.categoryIds.includes(id))
    )
  }

  // Apply payment method filter
  if (filters.paymentMethods && filters.paymentMethods.length > 0) {
    entries = entries.filter((e) =>
      e.paymentMethod ? filters.paymentMethods!.includes(e.paymentMethod) : false
    )
  }

  // Apply tag filter
  if (filters.tags && filters.tags.length > 0) {
    entries = entries.filter((e) =>
      filters.tags!.some((tag) => e.tags.includes(tag))
    )
  }

  // Apply search filter
  if (filters.search) {
    const q = filters.search.toLowerCase()
    const cats = await getCategories()
    entries = entries.filter((e) => {
      const matchNote = e.note.toLowerCase().includes(q)
      const matchRaw = e.rawInput.toLowerCase().includes(q)
      const matchPayment = getPaymentMethodLabel(e.paymentMethod).toLowerCase().includes(q)
      const matchCat = e.categoryIds.some((id) =>
        cats.find((c) => c.id === id)?.name.toLowerCase().includes(q)
      )
      return matchNote || matchRaw || matchPayment || matchCat
    })
  }

  const isEmpty = entries.length === 0

  // ── Budget check ─────────────────────────────────────────
  if (operation === 'budget_check') {
    const budgets = await getBudgets()
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const today = getTodayString()
    const monthEntries = await getEntriesInRange(monthStart, today)

    let relevantEntries = monthEntries.filter((e) => e.type === 'expense')
    let budgetLimit: number | undefined

    if (filters.categoryIds && filters.categoryIds.length > 0) {
      relevantEntries = relevantEntries.filter((e) =>
        filters.categoryIds!.some((id) => e.categoryIds.includes(id))
      )
      const budget = budgets.find((b) =>
        filters.categoryIds!.includes(b.categoryId)
      )
      budgetLimit = budget?.monthlyLimit
    } else {
      const overall = budgets.find((b) => b.categoryId === 'overall')
      budgetLimit = overall?.monthlyLimit
    }

    const budgetUsed = relevantEntries.reduce((s, e) => s + e.amount, 0)
    const budgetPercent = budgetLimit
      ? Math.round((budgetUsed / budgetLimit) * 100)
      : undefined

    return {
      operation,
      budgetLimit,
      budgetUsed,
      budgetPercent,
      count: relevantEntries.length,
      isEmpty: !budgetLimit,
    }
  }

  // ── Sum ──────────────────────────────────────────────────
  if (operation === 'sum') {
    const total = entries.reduce((s, e) => s + e.amount, 0)
    return { operation, total, count: entries.length, isEmpty }
  }

  // ── Count ────────────────────────────────────────────────
  if (operation === 'count') {
    return { operation, count: entries.length, isEmpty }
  }

  // ── Average ──────────────────────────────────────────────
  if (operation === 'average') {
    const total = entries.reduce((s, e) => s + e.amount, 0)
    const average = entries.length > 0 ? total / entries.length : 0
    return { operation, average, count: entries.length, isEmpty }
  }

  // ── Max ──────────────────────────────────────────────────
  if (operation === 'max') {
    const max = entries.reduce<Entry | null>(
      (best, e) => (!best || e.amount > best.amount ? e : best),
      null
    )
    return { operation, max, count: entries.length, isEmpty: !max }
  }

  // ── List ─────────────────────────────────────────────────
  if (operation === 'list') {
    return {
      operation,
      entries: entries.slice(0, 50),
      count: entries.length,
      isEmpty,
    }
  }

  return { operation, isEmpty: true }
}
