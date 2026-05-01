'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, PlusCircle, Save, Target } from 'lucide-react'
import { getBudgetByCategoryId, getSetting, setBudget, setSetting } from '@/lib/db'
import { FinancialGoal } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface Props {
  onBack: () => void
}

export default function MonthlyPlanScreen({ onBack }: Props) {
  const [income, setIncome] = useState('')
  const [budget, setBudgetDraft] = useState('')
  const [savings, setSavings] = useState('')
  const [goals, setGoals] = useState<FinancialGoal[]>([])
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const [nextIncome, nextSavings, nextGoals, overallBudget] = await Promise.all([
        getSetting('monthlyIncomeEstimate'),
        getSetting('monthlySavingsTarget'),
        getSetting('financialGoals'),
        getBudgetByCategoryId('overall'),
      ])
      setIncome(nextIncome ? String(nextIncome) : '')
      setSavings(nextSavings ? String(nextSavings) : '')
      setGoals(nextGoals ?? [])
      setBudgetDraft(overallBudget?.monthlyLimit ? String(overallBudget.monthlyLimit) : '')
    }
    load().catch((error: Error) => console.error(error))
  }, [])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2500)
  }

  const savePlan = async () => {
    const now = Date.now()
    const incomeNumber = Number(income)
    const savingsNumber = Number(savings)
    const budgetNumber = Number(budget)
    await setSetting('monthlyIncomeEstimate', Number.isFinite(incomeNumber) ? Math.max(incomeNumber, 0) : 0)
    await setSetting('monthlySavingsTarget', Number.isFinite(savingsNumber) ? Math.max(savingsNumber, 0) : 0)
    if (Number.isFinite(budgetNumber) && budgetNumber > 0) {
      const existing = await getBudgetByCategoryId('overall')
      await setBudget({
        id: existing?.id ?? 'budget-overall',
        categoryId: 'overall',
        monthlyLimit: budgetNumber,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
    }
    await setSetting('financialGoals', goals)
    showToast('Monthly plan saved')
  }

  const addGoal = () => {
    const now = Date.now()
    setGoals((current) => [
      ...current,
      {
        id: `goal-${now}`,
        name: 'New goal',
        targetAmount: 10000,
        savedAmount: 0,
        monthlyTarget: 1000,
        emoji: '🎯',
        createdAt: now,
        updatedAt: now,
      },
    ])
  }

  const updateGoal = (id: string, patch: Partial<FinancialGoal>) => {
    setGoals((current) =>
      current.map((goal) => goal.id === id ? { ...goal, ...patch, updatedAt: Date.now() } : goal)
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pb-4 pt-5 backdrop-blur">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-semibold text-indigo-500">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-black text-slate-950">Monthly plan</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Tune the numbers powering safe-to-spend and goals.</p>
      </div>

      <div className="space-y-4 px-4 py-4">
        <section className="dashboard-card p-4">
          <div className="grid grid-cols-1 gap-3">
            <PlanField label="Monthly income" value={income} onChange={setIncome} />
            <PlanField label="Spend budget" value={budget} onChange={setBudgetDraft} />
            <PlanField label="Savings target" value={savings} onChange={setSavings} />
          </div>
        </section>

        <section className="dashboard-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">Savings goals</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{goals.length} active target{goals.length === 1 ? '' : 's'}</p>
            </div>
            <button
              onClick={addGoal}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"
              aria-label="Add goal"
            >
              <PlusCircle className="h-4 w-4" />
            </button>
          </div>

          {goals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
              <Target className="mx-auto mb-2 h-5 w-5 text-indigo-500" />
              <p className="text-sm font-bold text-slate-700">No goals yet</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Add emergency fund, trip, phone, or debt payoff goals.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {goals.map((goal) => {
                const pct = goal.targetAmount > 0 ? Math.min((goal.savedAmount / goal.targetAmount) * 100, 100) : 0
                return (
                  <div key={goal.id} className="rounded-2xl bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        value={goal.emoji}
                        onChange={(e) => updateGoal(goal.id, { emoji: e.target.value.slice(0, 4) || '🎯' })}
                        className="h-10 w-12 rounded-xl bg-slate-100 text-center text-lg outline-none"
                        aria-label="Goal emoji"
                      />
                      <input
                        value={goal.name}
                        onChange={(e) => updateGoal(goal.id, { name: e.target.value })}
                        className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800 outline-none"
                        aria-label="Goal name"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <PlanField compact label="Saved" value={String(goal.savedAmount)} onChange={(value) => updateGoal(goal.id, { savedAmount: Number(value) || 0 })} />
                      <PlanField compact label="Target" value={String(goal.targetAmount)} onChange={(value) => updateGoal(goal.id, { targetAmount: Number(value) || 0 })} />
                      <PlanField compact label="Monthly" value={String(goal.monthlyTarget)} onChange={(value) => updateGoal(goal.id, { monthlyTarget: Number(value) || 0 })} />
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-slate-500">
                      {formatCurrency(goal.savedAmount)} of {formatCurrency(goal.targetAmount)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <button
          onClick={savePlan}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-black text-white active:scale-95"
        >
          <Save className="h-4 w-4" /> Save monthly plan
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] flex justify-center px-4">
          <div className="rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  )
}

function PlanField({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  compact?: boolean
}) {
  return (
    <label className={`block rounded-2xl bg-slate-100 ${compact ? 'px-2 py-2' : 'px-4 py-3'}`}>
      <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className="mt-1 w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:text-slate-300"
      />
    </label>
  )
}
