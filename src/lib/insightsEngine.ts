import { getCategoryAmountForMode } from './categoryMath'
import { Budget, Category, Entry, Settings } from './types'
import { formatCurrency, getMonthStartString, getTodayString } from './utils'

export type InsightTone = 'good' | 'warning' | 'danger' | 'neutral'

export interface SpendingInsight {
  id: string
  title: string
  detail: string
  tone: InsightTone
  filters?: object
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

function daysInclusive(start: string, end: string): number {
  const diff = parseDate(end).getTime() - parseDate(start).getTime()
  return Math.max(1, Math.floor(diff / 86_400_000) + 1)
}

function getMonthEndDay(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
}

function previousMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0)
  const fmt = (date: Date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
  return { start: fmt(start), end: fmt(end) }
}

export function buildSpendingInsights({
  entries,
  previousEntries,
  categories,
  budgets,
  multiCategoryMode,
}: {
  entries: Entry[]
  previousEntries: Entry[]
  categories: Category[]
  budgets: Budget[]
  multiCategoryMode: Settings['multiCategoryMode']
}): SpendingInsight[] {
  const today = getTodayString()
  const monthStart = getMonthStartString()
  const expenses = entries.filter((entry) => !entry.pending && entry.type === 'expense')
  const previousExpenses = previousEntries.filter((entry) => !entry.pending && entry.type === 'expense')
  const total = expenses.reduce((sum, entry) => sum + entry.amount, 0)
  const previousTotal = previousExpenses.reduce((sum, entry) => sum + entry.amount, 0)
  const daysElapsed = daysInclusive(monthStart, today)
  const dailyAverage = total / daysElapsed
  const projected = dailyAverage * getMonthEndDay()
  const insights: SpendingInsight[] = []
  const overallBudget = budgets.find((budget) => budget.categoryId === 'overall')

  if (overallBudget) {
    const left = overallBudget.monthlyLimit - total
    const projectedLeft = overallBudget.monthlyLimit - projected
    insights.push({
      id: 'budget-pace',
      title: projected > overallBudget.monthlyLimit ? 'Budget pace is high' : 'Budget pace is under control',
      detail:
        projected > overallBudget.monthlyLimit
          ? `At this pace you may land near ${formatCurrency(projected)}, ${formatCurrency(Math.abs(projectedLeft))} over plan.`
          : `${formatCurrency(Math.max(left, 0))} left now; projected month-end is ${formatCurrency(projected)}.`,
      tone: projected > overallBudget.monthlyLimit ? 'warning' : 'good',
      filters: { type: 'expense', dateFrom: monthStart, dateTo: today },
    })
  } else {
    insights.push({
      id: 'budget-missing',
      title: 'Set a monthly budget',
      detail: 'A budget unlocks safe-to-spend and pace warnings.',
      tone: 'neutral',
    })
  }

  if (previousTotal > 0) {
    const diff = total - previousTotal
    const pct = (diff / previousTotal) * 100
    insights.push({
      id: 'month-change',
      title: diff > 0 ? 'Spending is up this month' : 'Spending is lower this month',
      detail: `${Math.abs(pct).toFixed(0)}% ${diff > 0 ? 'higher' : 'lower'} than last month so far.`,
      tone: diff > 0 ? 'warning' : 'good',
      filters: { type: 'expense', dateFrom: monthStart, dateTo: today },
    })
  }

  const categoryTotals = categories.map((category) => {
    const totalForCategory = expenses
      .filter((entry) => entry.categoryIds.includes(category.id))
      .reduce((sum, entry) => sum + getCategoryAmountForMode(entry, category.id, multiCategoryMode), 0)
    const previousForCategory = previousExpenses
      .filter((entry) => entry.categoryIds.includes(category.id))
      .reduce((sum, entry) => sum + getCategoryAmountForMode(entry, category.id, multiCategoryMode), 0)
    return { category, total: totalForCategory, previous: previousForCategory }
  }).filter((item) => item.total > 0).sort((a, b) => b.total - a.total)

  const top = categoryTotals[0]
  if (top) {
    insights.push({
      id: 'top-category',
      title: `${top.category.name} leads this month`,
      detail: `${formatCurrency(top.total)} spent${top.previous > 0 ? `, ${formatCurrency(Math.abs(top.total - top.previous))} ${top.total >= top.previous ? 'above' : 'below'} last month` : ''}.`,
      tone: top.previous > 0 && top.total > top.previous * 1.25 ? 'warning' : 'neutral',
      filters: { type: 'expense', categoryIds: [top.category.id], dateFrom: monthStart, dateTo: today },
    })
  }

  const largest = [...expenses].sort((a, b) => b.amount - a.amount)[0]
  if (largest) {
    insights.push({
      id: 'largest-expense',
      title: 'Largest expense',
      detail: `${formatCurrency(largest.amount)}${largest.note ? ` for ${largest.note}` : ''}.`,
      tone: 'neutral',
      filters: { type: 'expense', dateFrom: largest.date, dateTo: largest.date, search: largest.note || largest.rawInput },
    })
  }

  if (total > 0) {
    insights.push({
      id: 'daily-average',
      title: 'Daily average',
      detail: `${formatCurrency(dailyAverage)} per day across ${daysElapsed} days this month.`,
      tone: 'neutral',
      filters: { type: 'expense', dateFrom: monthStart, dateTo: today },
    })
  }

  return insights.slice(0, 5)
}

export function getPreviousMonthRangeForInsights() {
  return previousMonthRange()
}

