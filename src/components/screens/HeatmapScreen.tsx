'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getEntriesInRange } from '@/lib/db'
import { Entry } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface Props {
  onBack: () => void
  onNavigateToHistory: (filters: object) => void
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type HeatmapCell =
  | { kind: 'blank'; key: string }
  | { kind: 'day'; key: string; day: number; date: string; total: number }

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month: string) {
  const [year, monthNum] = month.split('-').map(Number)
  const endDay = new Date(year, monthNum, 0).getDate()
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDay).padStart(2, '0')}`,
    days: endDay,
    firstWeekday: new Date(year, monthNum - 1, 1).getDay(),
  }
}

export default function HeatmapScreen({ onBack, onNavigateToHistory }: Props) {
  const [month, setMonth] = useState(currentMonth())
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const { start, end } = monthBounds(month)
    const monthEntries = await getEntriesInRange(start, end)
    setEntries(monthEntries.filter((entry) => entry.type === 'expense'))
    setLoading(false)
  }, [month])

  useEffect(() => {
    loadData()
  }, [loadData])

  const { days, firstWeekday } = monthBounds(month)
  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>()
    entries.forEach((entry) => {
      totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.amount)
    })
    return totals
  }, [entries])
  const total = [...dailyTotals.values()].reduce((sum, value) => sum + value, 0)
  const highest = [...dailyTotals.entries()].sort((a, b) => b[1] - a[1])[0]
  const max = highest?.[1] ?? 0
  const cells: HeatmapCell[] = [
    ...Array.from({ length: firstWeekday }, (_, index) => ({ kind: 'blank' as const, key: `blank-${index}` })),
    ...Array.from({ length: days }, (_, index) => {
      const day = index + 1
      const date = `${month}-${String(day).padStart(2, '0')}`
      return { kind: 'day' as const, key: date, day, date, total: dailyTotals.get(date) ?? 0 }
    }),
  ]

  const colorFor = (value = 0) => {
    if (value <= 0 || max <= 0) return 'bg-gray-100 text-gray-400'
    const ratio = value / max
    if (ratio >= 0.75) return 'bg-red-500 text-white'
    if (ratio >= 0.5) return 'bg-orange-400 text-white'
    if (ratio >= 0.25) return 'bg-yellow-300 text-yellow-900'
    return 'bg-indigo-100 text-indigo-700'
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
          <h1 className="text-xl font-bold text-gray-800">Spending heatmap</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white"
        />

        <div className="grid grid-cols-3 gap-3">
          <Metric label="Kharch" value={formatCurrency(total)} />
          <Metric label="Average" value={formatCurrency(total / days)} />
          <Metric label="Highest" value={highest ? formatCurrency(highest[1]) : '₹0'} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm px-4 py-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Heatmap load ho raha...</p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {WEEKDAYS.map((day, index) => (
                  <div key={`${day}-${index}`} className="text-center text-[10px] font-semibold text-gray-400">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell) => (
                  cell.kind === 'day' ? (
                    <button
                      key={cell.key}
                      onClick={() => onNavigateToHistory({
                        dateFrom: cell.date,
                        dateTo: cell.date,
                        type: 'expense',
                      })}
                      className={`aspect-square rounded-lg text-[11px] font-semibold ${colorFor(cell.total)}`}
                    >
                      {cell.day}
                    </button>
                  ) : (
                    <div key={cell.key} className="aspect-square" />
                  )
                ))}
              </div>
            </>
          )}
        </div>

        {highest && (
          <p className="text-xs text-gray-400 text-center">
            Allse zyada expense tha {formatCurrency(highest[1])} on {highest[0]}.
          </p>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm px-3 py-3">
      <p className="text-[10px] text-gray-400 uppercase font-semibold">{label}</p>
      <p className="text-sm font-bold text-gray-800 mt-1">{value}</p>
    </div>
  )
}
