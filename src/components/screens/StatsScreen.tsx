'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Flame,
  Gauge,
  Hash,
  LineChart,
  Sparkles,
  FileDown,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { getBudgets, getCategories, getEntriesInRange, getSetting } from '@/lib/db'
import { getCategoryAmountForMode } from '@/lib/categoryMath'
import { Budget, Category, Entry, Settings } from '@/lib/types'
import { formatCurrency, getPeriodRange } from '@/lib/utils'
import HeatmapScreen from './HeatmapScreen'
import { buildSpendingInsights } from '@/lib/insightsEngine'
import { exportMonthlyCsv, exportMonthlyPdf } from '@/lib/reports'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
)

type Period = 'this_month' | 'last_month' | '3_months'

const PERIOD_LABELS: Record<Period, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  '3_months': '3 months',
}

const CHART_COLORS = [
  '#4f46e5',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#db2777',
  '#2563eb',
  '#65a30d',
  '#ea580c',
  '#7c3aed',
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface CategoryStat {
  category: Category
  total: number
  count: number
  percent: number
  budget?: Budget
}

interface TrendPoint {
  label: string
  total: number
  start: string
  end: string
}

interface WeekdayStat {
  label: string
  total: number
  count: number
}

interface Props {
  onNavigateToHistory?: (filters: object) => void
}

function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysInclusive(start: string, end: string): number {
  const diff = parseDate(end).getTime() - parseDate(start).getTime()
  return Math.max(1, Math.floor(diff / 86_400_000) + 1)
}

function formatShortDate(date: string): string {
  return parseDate(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function getPreviousPeriodRange(period: Period): { start: string; end: string } {
  const now = new Date()
  if (period === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { start: toDateString(start), end: toDateString(end) }
  }

  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - 1, 0)
    return { start: toDateString(start), end: toDateString(end) }
  }

  const end = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
  const start = addDays(end, -89)
  return { start: toDateString(start), end: toDateString(end) }
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function sumExpenses(entries: Entry[]): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0)
}

function buildTrendSeries(range: { start: string; end: string }, expenses: Entry[], period: Period): TrendPoint[] {
  const points: TrendPoint[] = []
  let cursor = parseDate(range.start)
  const last = parseDate(range.end)
  const bucketDays = period === '3_months' ? 7 : 1

  while (cursor <= last) {
    const bucketStart = toDateString(cursor)
    const bucketEndDate = addDays(cursor, bucketDays - 1)
    const cappedEnd = bucketEndDate > last ? last : bucketEndDate
    const bucketEnd = toDateString(cappedEnd)
    const total = expenses
      .filter((entry) => entry.date >= bucketStart && entry.date <= bucketEnd)
      .reduce((sum, entry) => sum + entry.amount, 0)

    points.push({
      label: period === '3_months' ? formatShortDate(bucketStart) : String(parseDate(bucketStart).getDate()),
      total,
      start: bucketStart,
      end: bucketEnd,
    })
    cursor = addDays(cursor, bucketDays)
  }

  return points
}

function buildWeekdayStats(expenses: Entry[]): WeekdayStat[] {
  const stats = WEEKDAYS.map((label) => ({ label, total: 0, count: 0 }))
  expenses.forEach((entry) => {
    const day = parseDate(entry.date).getDay()
    stats[day].total += entry.amount
    stats[day].count += 1
  })
  return stats
}

function getDailyTotals(expenses: Entry[]): { date: string; total: number; count: number }[] {
  const totals = new Map<string, { total: number; count: number }>()
  expenses.forEach((entry) => {
    const current = totals.get(entry.date) ?? { total: 0, count: 0 }
    totals.set(entry.date, { total: current.total + entry.amount, count: current.count + 1 })
  })
  return [...totals.entries()]
    .map(([date, value]) => ({ date, total: value.total, count: value.count }))
    .sort((a, b) => b.total - a.total)
}

export default function StatsScreen({ onNavigateToHistory }: Props) {
  const [period, setPeriod] = useState<Period>('this_month')
  const [entries, setEntries] = useState<Entry[]>([])
  const [previousEntries, setPreviousEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [multiCategoryMode, setMultiCategoryMode] = useState<Settings['multiCategoryMode']>('each')
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const { start, end } = getPeriodRange(period)
    const previousRange = getPreviousPeriodRange(period)
    const [allEntries, previous, cats, buds, mode] = await Promise.all([
      getEntriesInRange(start, end),
      getEntriesInRange(previousRange.start, previousRange.end),
      getCategories(),
      getBudgets(),
      getSetting('multiCategoryMode'),
    ])
    setEntries(allEntries)
    setPreviousEntries(previous)
    setCategories(cats)
    setBudgets(buds)
    setMultiCategoryMode(mode ?? 'each')
    setLoading(false)
  }, [period])

  useEffect(() => {
    loadData()
  }, [loadData])

  const range = useMemo(() => getPeriodRange(period), [period])
  const navigateToHistory = onNavigateToHistory ?? (() => {})

  const expenses = useMemo(() => entries.filter((entry) => entry.type === 'expense'), [entries])
  const income = useMemo(() => entries.filter((entry) => entry.type === 'income'), [entries])
  const filteredExpenses = useMemo(
    () => (selectedTag ? expenses.filter((entry) => entry.tags.includes(selectedTag)) : expenses),
    [expenses, selectedTag]
  )
  const previousFilteredExpenses = useMemo(
    () =>
      previousEntries
        .filter((entry) => entry.type === 'expense')
        .filter((entry) => (selectedTag ? entry.tags.includes(selectedTag) : true)),
    [previousEntries, selectedTag]
  )

  const totalIncome = useMemo(() => income.reduce((sum, entry) => sum + entry.amount, 0), [income])
  const totalExpense = useMemo(() => sumExpenses(filteredExpenses), [filteredExpenses])
  const previousTotalExpense = useMemo(() => sumExpenses(previousFilteredExpenses), [previousFilteredExpenses])
  const comparisonDiff = totalExpense - previousTotalExpense
  const comparisonPct = previousTotalExpense > 0 ? (comparisonDiff / previousTotalExpense) * 100 : null
  const overallBudget = budgets.find((budget) => budget.categoryId === 'overall')
  const allPeriodTags = useMemo(() => [...new Set(expenses.flatMap((entry) => entry.tags))].sort(), [expenses])

  const categoryStats: CategoryStat[] = useMemo(
    () =>
      categories
        .filter((category) => !category.archived)
        .map((category) => {
          const catEntries = filteredExpenses.filter((entry) => entry.categoryIds.includes(category.id))
          const total = catEntries.reduce(
            (sum, entry) => sum + getCategoryAmountForMode(entry, category.id, multiCategoryMode),
            0
          )
          return {
            category,
            total,
            count: catEntries.length,
            percent: totalExpense > 0 ? (total / totalExpense) * 100 : 0,
            budget: budgets.find((budget) => budget.categoryId === category.id),
          }
        })
        .filter((stat) => stat.total > 0)
        .sort((a, b) => b.total - a.total),
    [budgets, categories, filteredExpenses, multiCategoryMode, totalExpense]
  )

  const tagStats = useMemo(() => {
    const tagTotals = new Map<string, number>()
    filteredExpenses.forEach((entry) => {
      entry.tags.forEach((tag) => tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + entry.amount))
    })
    const max = Math.max(...tagTotals.values(), 0)
    return [...tagTotals.entries()]
      .map(([tag, total]) => ({ tag, total, percent: max > 0 ? (total / max) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [filteredExpenses])

  const trendSeries = useMemo(() => buildTrendSeries(range, filteredExpenses, period), [filteredExpenses, period, range])
  const weekdayStats = useMemo(() => buildWeekdayStats(filteredExpenses), [filteredExpenses])
  const dailyTotals = useMemo(() => getDailyTotals(filteredExpenses), [filteredExpenses])
  const highestDay = dailyTotals[0] ?? null
  const activeDays = dailyTotals.length
  const daysInPeriod = daysInclusive(range.start, range.end)
  const dailyAverage = totalExpense / daysInPeriod
  const bestWeekday = [...weekdayStats].sort((a, b) => b.total - a.total)[0]
  const topCategory = categoryStats[0] ?? null
  const currentMonthEnd = getMonthEnd(new Date())
  const daysElapsedThisMonth = daysInclusive(range.start, range.end)
  const projectedSpend =
    period === 'this_month' && totalExpense > 0
      ? (totalExpense / daysElapsedThisMonth) * currentMonthEnd.getDate()
      : totalExpense
  const budgetUsedPct = overallBudget ? (totalExpense / overallBudget.monthlyLimit) * 100 : 0
  const projectedBudgetPct = overallBudget ? (projectedSpend / overallBudget.monthlyLimit) * 100 : 0

  const previousCategoryTotals = useMemo(() => {
    const totals = new Map<string, number>()
    previousFilteredExpenses.forEach((entry) => {
      entry.categoryIds.forEach((categoryId) => {
        totals.set(
          categoryId,
          (totals.get(categoryId) ?? 0) + getCategoryAmountForMode(entry, categoryId, multiCategoryMode)
        )
      })
    })
    return totals
  }, [multiCategoryMode, previousFilteredExpenses])

  const topCategoryComparisons = categoryStats.slice(0, 3).map((stat) => {
    const previous = previousCategoryTotals.get(stat.category.id) ?? 0
    return {
      category: stat.category,
      current: stat.total,
      previous,
      diff: stat.total - previous,
    }
  })

  const doughnutData = {
    labels: categoryStats.map((stat) => stat.category.name),
    datasets: [
      {
        data: categoryStats.map((stat) => stat.total),
        backgroundColor: CHART_COLORS.slice(0, categoryStats.length),
        borderColor: '#ffffff',
        borderWidth: 4,
        hoverOffset: 8,
      },
    ],
  }

  const doughnutOptions: ChartOptions<'doughnut'> = {
    cutout: '72%',
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'doughnut'>) => ` ${ctx.label}: ${formatCurrency(Number(ctx.raw))}`,
        },
      },
    },
  }

  const trendData = {
    labels: trendSeries.map((point) => point.label),
    datasets: [
      {
        label: 'Spend',
        data: trendSeries.map((point) => point.total),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.12)',
        pointBackgroundColor: '#4f46e5',
        pointBorderWidth: 0,
        pointRadius: trendSeries.length > 35 ? 0 : 2.5,
        pointHoverRadius: 5,
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
      },
    ],
  }

  const trendOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6, color: '#94a3b8', font: { size: 10 } },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.18)' },
        ticks: {
          color: '#94a3b8',
          font: { size: 10 },
          callback: (value) => formatCurrency(Number(value)).replace('.00', ''),
        },
        border: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const point = trendSeries[items[0]?.dataIndex ?? 0]
            return point.start === point.end ? formatShortDate(point.start) : `${formatShortDate(point.start)} - ${formatShortDate(point.end)}`
          },
          label: (ctx: TooltipItem<'line'>) => ` Spend: ${formatCurrency(Number(ctx.raw))}`,
        },
      },
    },
  }

  const weekdayData = {
    labels: weekdayStats.map((stat) => stat.label),
    datasets: [
      {
        data: weekdayStats.map((stat) => stat.total),
        backgroundColor: weekdayStats.map((stat) => (stat.label === bestWeekday?.label ? '#4f46e5' : '#dbeafe')),
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  }

  const weekdayOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 11, weight: 600 } },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(148, 163, 184, 0.16)' },
        ticks: { display: false },
        border: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => ` ${formatCurrency(Number(ctx.raw))}`,
        },
      },
    },
  }

  const openHistory = (filters: object) => navigateToHistory({ type: 'expense', ...filters })
  const localInsights = useMemo(
    () =>
      buildSpendingInsights({
        entries,
        previousEntries,
        categories,
        budgets,
        multiCategoryMode,
      }),
    [budgets, categories, entries, multiCategoryMode, previousEntries]
  )

  const exportReport = async (format: 'csv' | 'pdf') => {
    setReporting(true)
    try {
      if (format === 'csv') await exportMonthlyCsv(period === 'last_month' ? 'last_month' : 'this_month')
      else await exportMonthlyPdf(period === 'last_month' ? 'last_month' : 'this_month')
    } finally {
      setReporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm">
          <BarChart3 className="mx-auto mb-2 h-5 w-5 text-indigo-500" />
          <p className="text-sm font-semibold text-slate-700">Loading analytics...</p>
          <p className="mt-0.5 text-xs text-slate-400">Crunching this period's spending.</p>
        </div>
      </div>
    )
  }

  if (showHeatmap) {
    return (
      <HeatmapScreen
        onBack={() => setShowHeatmap(false)}
        onNavigateToHistory={navigateToHistory}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col pb-5">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 pb-4 pt-5 backdrop-blur">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Analytics</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Stats</h1>
            <p className="mt-1 text-xs font-medium text-slate-400">
              {selectedTag ? `Filtered by #${selectedTag}` : 'Spending patterns and money signals'}
            </p>
          </div>
          <button
            onClick={() => setShowHeatmap(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600 shadow-sm"
            aria-label="Open spending heatmap"
          >
            <CalendarDays className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-2xl bg-slate-100 p-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((item) => (
            <button
              key={item}
              onClick={() => setPeriod(item)}
              className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all duration-200 ${
                period === item ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'
              }`}
            >
              {PERIOD_LABELS[item]}
            </button>
          ))}
        </div>

        {allPeriodTags.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedTag(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                selectedTag === null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              All
            </button>
            {allPeriodTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  selectedTag === tag ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 px-4 pt-4">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">Local insights</p>
              <p className="mt-0.5 text-xs font-medium text-slate-400">Private signals generated from this device.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => exportReport('csv')}
                disabled={reporting}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 disabled:opacity-40"
                aria-label="Export CSV report"
              >
                <FileDown className="h-4 w-4" />
              </button>
              <button
                onClick={() => exportReport('pdf')}
                disabled={reporting}
                className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-600 disabled:opacity-40"
              >
                PDF
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {localInsights.slice(0, 3).map((item) => (
              <button
                key={item.id}
                onClick={() => item.filters && openHistory(item.filters)}
                disabled={!item.filters}
                className={`w-full rounded-2xl px-3 py-2.5 text-left disabled:pointer-events-none ${
                  item.tone === 'danger'
                    ? 'bg-rose-50'
                    : item.tone === 'warning'
                      ? 'bg-amber-50'
                      : item.tone === 'good'
                        ? 'bg-emerald-50'
                        : 'bg-slate-50'
                }`}
              >
                <p className="text-sm font-black text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-xs font-medium leading-relaxed text-slate-500">{item.detail}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-indigo-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-500">Total spent</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{formatCurrency(totalExpense)}</p>
              <p className="mt-1 text-xs font-medium text-slate-400">
                {filteredExpenses.length} expenses across {activeDays} active days
              </p>
            </div>
            <div className={`flex items-center gap-1 rounded-2xl px-2.5 py-1.5 text-xs font-black ${
              comparisonDiff <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
            }`}>
              {comparisonDiff <= 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
              {comparisonPct === null ? 'New' : `${comparisonPct > 0 ? '+' : ''}${comparisonPct.toFixed(0)}%`}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric
              icon={Wallet}
              label="Income"
              value={formatCurrency(totalIncome)}
              tone="emerald"
            />
            <MiniMetric
              icon={Activity}
              label="Daily avg"
              value={formatCurrency(dailyAverage)}
              tone="indigo"
            />
            <MiniMetric
              icon={Flame}
              label="Top day"
              value={highestDay ? formatCurrency(highestDay.total) : '₹0'}
              tone="rose"
            />
          </div>
        </section>

        {totalExpense > 0 ? (
          <>
            <section className="grid grid-cols-1 gap-3">
              <InsightCard
                icon={comparisonDiff <= 0 ? ArrowDownRight : ArrowUpRight}
                title="Previous period"
                value={
                  comparisonDiff === 0
                    ? 'No change'
                    : `${comparisonDiff > 0 ? '+' : '-'}${formatCurrency(Math.abs(comparisonDiff))}`
                }
                detail={
                  comparisonPct === null
                    ? 'No previous period data yet'
                    : `${Math.abs(comparisonPct).toFixed(0)}% ${comparisonDiff <= 0 ? 'lower' : 'higher'} than before`
                }
                positive={comparisonDiff <= 0}
              />
              <div className="grid grid-cols-2 gap-3">
                <InsightCard
                  icon={CalendarDays}
                  title="Highest day"
                  value={highestDay ? formatShortDate(highestDay.date) : '-'}
                  detail={highestDay ? `${formatCurrency(highestDay.total)} from ${highestDay.count} entries` : 'No spending yet'}
                />
                <InsightCard
                  icon={Sparkles}
                  title="Pattern"
                  value={bestWeekday?.total ? bestWeekday.label : '-'}
                  detail={bestWeekday?.total ? `Most spend lands on ${bestWeekday.label}` : 'Log more days to see it'}
                />
              </div>
            </section>

            {overallBudget && (
              <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Budget burn</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-400">
                      {period === 'this_month' ? 'Projected from this month pace' : 'Actual spend in this period'}
                    </p>
                  </div>
                  <Gauge className={`h-5 w-5 ${
                    projectedBudgetPct >= 100 ? 'text-rose-500' : projectedBudgetPct >= 80 ? 'text-amber-500' : 'text-indigo-500'
                  }`} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black text-slate-950">{formatCurrency(totalExpense)}</p>
                    <p className="text-xs font-semibold text-slate-400">of {formatCurrency(overallBudget.monthlyLimit)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${
                      projectedBudgetPct >= 100 ? 'text-rose-600' : projectedBudgetPct >= 80 ? 'text-amber-600' : 'text-indigo-600'
                    }`}>
                      {period === 'this_month' ? `${formatCurrency(projectedSpend)} projected` : `${budgetUsedPct.toFixed(0)}% used`}
                    </p>
                    <p className="text-xs font-medium text-slate-400">
                      {Math.max(0, overallBudget.monthlyLimit - totalExpense) > 0
                        ? `${formatCurrency(Math.max(0, overallBudget.monthlyLimit - totalExpense))} left`
                        : 'Limit crossed'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      budgetUsedPct >= 100 ? 'bg-rose-500' : budgetUsedPct >= 80 ? 'bg-amber-400' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(budgetUsedPct, 100)}%` }}
                  />
                </div>
                {period === 'this_month' && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-50">
                    <div
                      className="h-full rounded-full bg-slate-300"
                      style={{ width: `${Math.min(projectedBudgetPct, 100)}%` }}
                    />
                  </div>
                )}
              </section>
            )}

            <ChartPanel
              icon={LineChart}
              title="Spending rhythm"
              subtitle={period === '3_months' ? 'Weekly buckets show the bigger pattern' : 'Daily spend for the selected period'}
            >
              <div className="h-56">
                <Line data={trendData} options={trendOptions} />
              </div>
            </ChartPanel>

            <ChartPanel
              icon={BarChart3}
              title="Weekday behavior"
              subtitle={bestWeekday?.total ? `${bestWeekday.label} is your heaviest spend day` : 'Log more entries to see weekday habits'}
            >
              <div className="h-48">
                <Bar data={weekdayData} options={weekdayOptions} />
              </div>
            </ChartPanel>

            {categoryStats.length > 0 && (
              <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">Category mix</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-400">
                      {topCategory
                        ? `${topCategory.category.name} is ${topCategory.percent.toFixed(0)}% of spending`
                        : 'No categories yet'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowHeatmap(true)}
                    className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-600"
                  >
                    Heatmap
                  </button>
                </div>
                <div className="flex items-center gap-5">
                  <div className="relative h-36 w-36 shrink-0">
                    <Doughnut data={doughnutData} options={doughnutOptions} />
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Top</span>
                      <span className="mt-0.5 max-w-20 truncate text-sm font-black text-slate-900">
                        {topCategory?.category.name ?? '-'}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {categoryStats.slice(0, 5).map((stat, index) => (
                      <button
                        key={stat.category.id}
                        onClick={() => openHistory({ categoryIds: [stat.category.id], dateFrom: range.start, dateTo: range.end })}
                        className="w-full text-left"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-bold text-slate-700">
                            {stat.category.emoji} {stat.category.name}
                          </span>
                          <span className="text-xs font-black text-slate-900">{stat.percent.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(stat.percent, 4)}%`,
                              backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3">
                <p className="text-sm font-black text-slate-900">Category breakdown</p>
                <p className="mt-0.5 text-xs font-medium text-slate-400">
                  {multiCategoryMode === 'each'
                    ? 'Multi-category entries count full amount in each category.'
                    : 'Multi-category entries are split evenly.'}
                </p>
              </div>
              <div className="space-y-3">
                {categoryStats.map((stat, index) => {
                  const budgetPct = stat.budget ? (stat.total / stat.budget.monthlyLimit) * 100 : null
                  const previous = previousCategoryTotals.get(stat.category.id) ?? 0
                  const diff = stat.total - previous
                  return (
                    <button
                      key={stat.category.id}
                      onClick={() => openHistory({ categoryIds: [stat.category.id], dateFrom: range.start, dateTo: range.end })}
                      className="w-full rounded-2xl bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {stat.category.emoji} {stat.category.name}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-slate-400">
                            {stat.count} entries
                            {diff !== 0 && ` • ${diff > 0 ? '+' : '-'}${formatCurrency(Math.abs(diff))} vs prev`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-slate-950">{formatCurrency(stat.total)}</p>
                          <p className="text-xs font-bold text-slate-400">{stat.percent.toFixed(0)}%</p>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(stat.percent, 3)}%`,
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                          }}
                        />
                      </div>
                      {budgetPct !== null && (
                        <p className={`mt-1.5 text-[11px] font-bold ${
                          budgetPct >= 100 ? 'text-rose-600' : budgetPct >= 80 ? 'text-amber-600' : 'text-slate-400'
                        }`}>
                          {budgetPct.toFixed(0)}% of {formatCurrency(stat.budget?.monthlyLimit ?? 0)} budget used
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            {topCategoryComparisons.length > 0 && (
              <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-black text-slate-900">Biggest category moves</p>
                <div className="space-y-2">
                  {topCategoryComparisons.map((item) => (
                    <div key={item.category.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                      <span className="min-w-0 truncate text-sm font-bold text-slate-700">
                        {item.category.emoji} {item.category.name}
                      </span>
                      <span className={`shrink-0 text-sm font-black ${item.diff <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {item.diff === 0 ? 'No change' : `${item.diff > 0 ? '+' : '-'}${formatCurrency(Math.abs(item.diff))}`}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tagStats.length > 0 && (
              <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">Top tags</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-400">Tap a tag to open matching entries</p>
                  </div>
                  <Hash className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="space-y-3">
                  {tagStats.map((stat) => (
                    <button
                      key={stat.tag}
                      onClick={() => openHistory({ tags: [stat.tag], dateFrom: range.start, dateTo: range.end })}
                      className="w-full text-left"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-black text-indigo-600">#{stat.tag}</span>
                        <span className="text-sm font-black text-slate-800">{formatCurrency(stat.total)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-indigo-50">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(stat.percent, 5)}%` }} />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-5 py-10 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-black text-slate-900">No expenses in this view</h2>
            <p className="mx-auto mt-1 max-w-64 text-sm font-medium text-slate-400">
              Try another period or remove the tag filter to see charts, patterns, and budget signals.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

function MiniMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  tone: 'emerald' | 'indigo' | 'rose'
}) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone]

  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-2.5">
      <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  )
}

function InsightCard({
  icon: Icon,
  title,
  value,
  detail,
  positive,
}: {
  icon: typeof Sparkles
  title: string
  value: string
  detail: string
  positive?: boolean
}) {
  const toneClass =
    positive === undefined
      ? 'bg-indigo-50 text-indigo-600'
      : positive
      ? 'bg-emerald-50 text-emerald-600'
      : 'bg-rose-50 text-rose-600'

  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="truncate text-lg font-black text-slate-950">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-400">{detail}</p>
    </div>
  )
}

function ChartPanel({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof BarChart3
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-400">{subtitle}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {children}
    </section>
  )
}
