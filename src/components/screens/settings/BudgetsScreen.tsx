'use client'

import { useEffect, useState, useCallback } from 'react'
import { deleteBudget, getCategories, getBudgets, setBudget } from '@/lib/db'
import { Category, Budget } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  onBack: () => void
}

export default function BudgetsScreen({ onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [editing, setEditing] = useState<string | null>(null) // categoryId or 'overall'
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [cats, buds] = await Promise.all([getCategories(), getBudgets()])
    setCategories(cats.filter((c) => !c.archived))
    setBudgets(buds)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const getBudgetForCategory = (categoryId: string) =>
    budgets.find((b) => b.categoryId === categoryId)

  const startEditing = (categoryId: string) => {
    const existing = getBudgetForCategory(categoryId)
    setInputValue(existing ? String(existing.monthlyLimit) : '')
    setEditing(categoryId)
  }

  const handleSave = async (categoryId: string) => {
    const amount = Number(inputValue)
    if (!amount || amount <= 0) {
      setEditing(null)
      return
    }
    setSaving(true)
    const existing = getBudgetForCategory(categoryId)
    const now = Date.now()
    const budget: Budget = existing
      ? { ...existing, monthlyLimit: amount, updatedAt: now }
      : {
          id: uuidv4(),
          categoryId,
          monthlyLimit: amount,
          createdAt: now,
          updatedAt: now,
        }
    await setBudget(budget)
    await loadData()
    setSaving(false)
    setEditing(null)
    showToast('✅ Budget saved')
  }

  const handleRemove = async (categoryId: string) => {
    const existing = getBudgetForCategory(categoryId)
    if (!existing) return
    await deleteBudget(existing.id)
    await loadData()
    showToast('🗑 Budget removed')
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-indigo-500 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Monthly budgets</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-9">
          Resets on the 1st of every month
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">

        {/* Overall budget */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            Overall
          </p>
          <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
            <BudgetRow
              label="Total Monthly Budget"
              emoji="📊"
              budget={getBudgetForCategory('overall')}
              isEditing={editing === 'overall'}
              inputValue={inputValue}
              saving={saving}
              onEdit={() => startEditing('overall')}
              onSave={() => handleSave('overall')}
              onRemove={() => handleRemove('overall')}
              onInputChange={setInputValue}
            />
          </div>
        </div>

        {/* Per category */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            Per Category
          </p>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {categories.map((cat, i) => (
              <div
                key={cat.id}
                className={i < categories.length - 1 ? 'border-b border-gray-50' : ''}
              >
                <BudgetRow
                  label={cat.name}
                  emoji={cat.emoji}
                  budget={getBudgetForCategory(cat.id)}
                  isEditing={editing === cat.id}
                  inputValue={inputValue}
                  saving={saving}
                  onEdit={() => startEditing(cat.id)}
                  onSave={() => handleSave(cat.id)}
                  onRemove={() => handleRemove(cat.id)}
                  onInputChange={setInputValue}
                />
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center px-4">
          Tap a category to set or edit its monthly limit.
          Budget warnings appear at 80% and 100%.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Budget Row ───────────────────────────────────────────────
function BudgetRow({
  label,
  emoji,
  budget,
  isEditing,
  inputValue,
  saving,
  onEdit,
  onSave,
  onRemove,
  onInputChange,
}: {
  label: string
  emoji: string
  budget: Budget | undefined
  isEditing: boolean
  inputValue: string
  saving: boolean
  onEdit: () => void
  onSave: () => void
  onRemove: () => void
  onInputChange: (v: string) => void
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>

        {!isEditing && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-sm"
          >
            {budget ? (
              <span className="text-indigo-600 font-semibold">
                {formatCurrency(budget.monthlyLimit)}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">Set limit</span>
            )}
            <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Inline edit */}
      {isEditing && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 flex items-center bg-gray-100 rounded-xl px-3 py-2 gap-1">
            <span className="text-gray-400 text-sm">₹</span>
            <input
              type="number"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSave()}
              placeholder="e.g. 5000"
              autoFocus
              className="flex-1 bg-transparent text-sm text-gray-800 outline-none"
              inputMode="numeric"
            />
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-xl disabled:opacity-60"
          >
            Save
          </button>
          {budget && (
            <button
              onClick={onRemove}
              className="px-3 py-2 bg-red-50 text-red-500 text-sm font-semibold rounded-xl"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}
