'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAllEntries, getBudgets, getCategories, getSetting } from '@/lib/db'
import { Budget, Category, Entry, Settings } from '@/lib/types'
import { getCategoryAmountForMode } from '@/lib/categoryMath'
import { formatCurrency } from '@/lib/utils'

interface Props {
  onBack: () => void
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function YearReviewScreen({ onBack }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [multiCategoryMode, setMultiCategoryMode] = useState<Settings['multiCategoryMode']>('each')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [allEntries, cats, buds, mode] = await Promise.all([
      getAllEntries(),
      getCategories(),
      getBudgets(),
      getSetting('multiCategoryMode'),
    ])
    setEntries(allEntries)
    setCategories(cats)
    setBudgets(buds)
    setMultiCategoryMode(mode ?? 'each')
    const years = [...new Set(allEntries.map((entry) => Number(entry.date.slice(0, 4))))].sort((a, b) => b - a)
    if (years.length > 0 && !years.includes(selectedYear)) setSelectedYear(years[0])
    setLoading(false)
  }, [selectedYear])

  useEffect(() => {
    loadData()
  }, [loadData])

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  )
  const availableYears = useMemo(
    () => [...new Set(entries.map((entry) => Number(entry.date.slice(0, 4))))].sort((a, b) => b - a),
    [entries]
  )
  const yearEntries = entries.filter((entry) => entry.date.startsWith(String(selectedYear)))
  const expenses = yearEntries.filter((entry) => entry.type === 'expense')
  const income = yearEntries.filter((entry) => entry.type === 'income')
  const totalKharch = expenses.reduce((sum, entry) => sum + entry.amount, 0)
  const totalIncome = income.reduce((sum, entry) => sum + entry.amount, 0)
  const monthlyTotals = MONTHS.map((_, index) => {
    const month = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
    return expenses
      .filter((entry) => entry.date.startsWith(month))
      .reduce((sum, entry) => sum + entry.amount, 0)
  })
  const maxMonth = Math.max(...monthlyTotals, 1)
  const busiestMonthIndex = monthlyTotals.indexOf(Math.max(...monthlyTotals))
  const biggestExpense = expenses.reduce<Entry | null>(
    (biggest, entry) => (!biggest || entry.amount > biggest.amount ? entry : biggest),
    null
  )

  const categoryTotals = new Map<string, number>()
  const tagTotals = new Map<string, number>()
  expenses.forEach((entry) => {
    entry.categoryIds.forEach((categoryId) => {
      categoryTotals.set(
        categoryId,
        (categoryTotals.get(categoryId) ?? 0) +
          getCategoryAmountForMode(entry, categoryId, multiCategoryMode)
      )
    })
    entry.tags.forEach((tag) => {
      tagTotals.set(tag, (tagTotals.get(tag) ?? 0) + entry.amount)
    })
  })
  const topCategories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const topTags = [...tagTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const budgetOverruns = budgets.filter((budget) => {
    if (budget.categoryId === 'overall') {
      return monthlyTotals.some((total) => total > budget.monthlyLimit)
    }
    return MONTHS.some((_, index) => {
      const month = `${selectedYear}-${String(index + 1).padStart(2, '0')}`
      const monthCategoryTotal = expenses
        .filter((entry) => entry.date.startsWith(month) && entry.categoryIds.includes(budget.categoryId))
        .reduce(
          (sum, entry) => sum + getCategoryAmountForMode(entry, budget.categoryId, multiCategoryMode),
          0
        )
      return monthCategoryTotal > budget.monthlyLimit
    })
  }).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-400 text-sm">Loading review...</p>
      </div>
    )
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
          <h1 className="text-xl font-bold text-gray-800">Year review</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white"
        >
          {(availableYears.length ? availableYears : [selectedYear]).map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>

        {yearEntries.length === 0 ? (
          <div className="bg-white rounded-2xl px-4 py-10 shadow-sm text-center">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-sm text-gray-400">No entries for this year yet</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ReviewCard label="Kharch" value={formatCurrency(totalKharch)} tone="red" />
              <ReviewCard label="Income" value={formatCurrency(totalIncome)} tone="green" />
              <ReviewCard label="Net" value={formatCurrency(totalIncome - totalKharch)} tone="indigo" />
              <ReviewCard label="Budget overrun" value={String(budgetOverruns)} tone="yellow" />
            </div>

            <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Monthly Spending</p>
              <div className="space-y-2">
                {monthlyTotals.map((total, index) => (
                  <div key={MONTHS[index]} className="grid grid-cols-[36px_1fr_80px] items-center gap-2">
                    <span className="text-xs text-gray-400">{MONTHS[index]}</span>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-400 rounded-full"
                        style={{ width: `${(total / maxMonth) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-700 text-right">{formatCurrency(total)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700 mb-2">Highlights</p>
              <Highlight label="Busiest month" value={MONTHS[busiestMonthIndex]} />
              <Highlight
                label="Biggest expense"
                value={biggestExpense ? `${formatCurrency(biggestExpense.amount)} · ${biggestExpense.note || biggestExpense.rawInput || 'Expense'}` : 'None'}
              />
            </div>

            <ListSection
              title="Top Categories"
              items={topCategories.map(([id, total]) => ({
                label: `${categoryById.get(id)?.emoji ?? '•'} ${categoryById.get(id)?.name ?? id}`,
                value: formatCurrency(total),
              }))}
            />
            <ListSection
              title="Top tags"
              items={topTags.map(([tag, total]) => ({
                label: `#${tag}`,
                value: formatCurrency(total),
              }))}
            />
          </>
        )}
      </div>
    </div>
  )
}

function ReviewCard({ label, value, tone }: { label: string; value: string; tone: 'red' | 'green' | 'indigo' | 'yellow' }) {
  const classes = {
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  }
  return (
    <div className={`rounded-2xl p-4 ${classes[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  )
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{value}</span>
    </div>
  )
}

function ListSection({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  if (items.length === 0) return null
  return (
    <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
      <p className="text-sm font-semibold text-gray-700 mb-3">{title}</p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-3">
            <span className="text-sm text-gray-600">{item.label}</span>
            <span className="text-sm font-semibold text-gray-800">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
