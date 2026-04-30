'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, ChevronLeft, Trash2 } from 'lucide-react'
import { deleteRecurringRule, getCategories, getRecurringRules, saveRecurringRule } from '@/lib/db'
import { Category, RecurringRule } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface Props {
  onBack: () => void
}

export default function RecurringScreen({ onBack }: Props) {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [nextRules, nextCategories] = await Promise.all([
      getRecurringRules(),
      getCategories(),
    ])
    setRules(nextRules)
    setCategories(nextCategories)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2500)
  }

  const categoryLabel = (rule: RecurringRule) =>
    rule.entryTemplate.categoryIds
      .map((id) => categories.find((category) => category.id === id)?.name)
      .filter(Boolean)
      .join(', ') || 'Uncategorized'

  const toggleRule = async (rule: RecurringRule) => {
    await saveRecurringRule({ ...rule, enabled: !rule.enabled, updatedAt: Date.now() })
    await loadData()
  }

  const removeRule = async (id: string) => {
    await deleteRecurringRule(id)
    await loadData()
    showToast('Recurring rule deleted')
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 pb-3 pt-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-xl p-1 text-indigo-600" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Recurring Expenses</h1>
            <p className="text-xs text-slate-500">Due items appear on Home for confirmation.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {rules.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center shadow-sm">
            <CalendarClock className="mx-auto h-9 w-9 text-indigo-500" />
            <p className="mt-3 text-sm font-semibold text-slate-800">No recurring rules yet</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Open any entry detail and choose Recurring to schedule rent, subscriptions, salary, or repeat bills.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            {rules.map((rule, index) => (
              <div
                key={rule.id}
                className={`flex items-center gap-3 px-4 py-4 ${
                  index < rules.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {rule.entryTemplate.note || categoryLabel(rule)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatCurrency(rule.entryTemplate.amount)} · {rule.frequency} · due {rule.nextDueDate}
                  </p>
                </div>
                <button
                  onClick={() => toggleRule(rule)}
                  className={`h-7 w-12 rounded-full p-0.5 transition-colors ${
                    rule.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                  aria-label={rule.enabled ? 'Disable recurring rule' : 'Enable recurring rule'}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      rule.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <button
                  onClick={() => removeRule(rule.id)}
                  className="rounded-xl bg-red-50 p-2 text-red-500"
                  aria-label="Delete recurring rule"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
