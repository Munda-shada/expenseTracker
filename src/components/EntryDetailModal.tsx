'use client'

import { useState } from 'react'
import { Entry, Category, RecurringFrequency, getPaymentMethodLabel } from '@/lib/types'
import { formatCurrency, formatDisplayDate, getTodayString } from '@/lib/utils'
import { deleteEntry, saveRecurringRule } from '@/lib/db'
import { useModalDismiss } from '@/lib/useModalDismiss'
import { CalendarPlus, Copy, Pencil, Trash2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import ModalShell from '@/components/ModalShell'

interface Props {
  entry: Entry
  categories: Category[]
  onClose: () => void
  onDeleted: () => void
  onRepeat: (entry: Entry) => void
  onEdit: (entry: Entry) => void
  onNavigateToHistory?: (filters: object) => void
}

export default function EntryDetailModal({
  entry,
  categories,
  onClose,
  onDeleted,
  onRepeat,
  onEdit,
  onNavigateToHistory,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showRecurring, setShowRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextDueDate, setNextDueDate] = useState(getTodayString())
  const [deleting, setDeleting] = useState(false)
  const { requestClose, backdropProps } = useModalDismiss({ isDirty: confirmDelete, onClose })

  const getCategoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id

  const getCategoryEmoji = (id: string) =>
    categories.find((c) => c.id === id)?.emoji ?? '📦'

  const handleDelete = async () => {
    setDeleting(true)
    await deleteEntry(entry.id)
    setDeleting(false)
    onDeleted()
  }

  const handleMakeRecurring = async () => {
    const now = Date.now()
    await saveRecurringRule({
      id: uuidv4(),
      entryTemplate: {
        type: entry.type,
        amount: entry.amount,
        categoryIds: entry.categoryIds,
        paymentMethod: entry.paymentMethod ?? null,
        tags: entry.tags,
        note: entry.note || getCategoryName(entry.categoryIds[0]),
      },
      frequency,
      interval: 1,
      nextDueDate,
      enabled: true,
      lastPromptedDueDate: null,
      createdAt: now,
      updatedAt: now,
    })
    setShowRecurring(false)
    onClose()
  }

  const sourceLabel: Record<string, string> = {
    ai: 'AI',
    manual: 'Manual',
    quickAdd: 'Quick Action',
    bulk: 'Bulk',
  }

  return (
    <ModalShell
      title="Entry Detail"
      onClose={requestClose}
      backdropProps={backdropProps}
      bodyClassName="px-4 py-5 space-y-5"
      footer={!confirmDelete && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-500 transition-transform active:scale-95"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button
            onClick={() => onEdit(entry)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-700 transition-transform active:scale-95"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button
            onClick={() => onRepeat(entry)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            <Copy className="h-4 w-4" /> Repeat
          </button>
          <button
            onClick={() => setShowRecurring(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            <CalendarPlus className="h-4 w-4" /> Recurring
          </button>
        </div>
      )}
    >

          {/* Amount + type */}
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-3xl font-bold ${
                entry.type === 'income' ? 'text-green-600' : 'text-gray-800'
              }`}>
                {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
              </p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block ${
                entry.type === 'income'
                  ? 'bg-green-50 text-green-600'
                  : 'bg-red-50 text-red-500'
              }`}>
                {entry.type === 'expense' ? 'Expense' : 'Income'}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">
                {formatDisplayDate(entry.date)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(entry.createdAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Categories */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Categories
            </p>
            <div className="flex flex-wrap gap-2">
              {entry.categoryIds.map((id) => (
                <span
                  key={id}
                  className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 text-sm px-3 py-1.5 rounded-full font-medium"
                >
                  <span>{getCategoryEmoji(id)}</span>
                  <span>{getCategoryName(id)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Payment Method
            </p>
            <button
              onClick={() => onNavigateToHistory?.({ paymentMethod: entry.paymentMethod ?? 'unspecified' })}
              className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600"
            >
              {getPaymentMethodLabel(entry.paymentMethod)}
            </button>
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => onNavigateToHistory?.({ tags: [tag] })}
                    className="bg-indigo-50 text-indigo-400 text-xs px-2.5 py-1 rounded-full"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          {entry.note && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Note
              </p>
              <p className="text-sm text-gray-700">{entry.note}</p>
            </div>
          )}

          {/* Meta */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
            <div className="flex justify-between">
              <p className="text-xs text-gray-400">Original input</p>
              <p className="text-xs text-gray-600 italic max-w-[60%] text-right">
                &quot;{entry.rawInput}&quot;
              </p>
            </div>
            <div className="flex justify-between">
              <p className="text-xs text-gray-400">Source</p>
              <p className="text-xs text-gray-600">{sourceLabel[entry.source] ?? entry.source}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-xs text-gray-400">Confidence</p>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                entry.confidence === 'high'
                  ? 'bg-green-50 text-green-600'
                  : entry.confidence === 'medium'
                  ? 'bg-yellow-50 text-yellow-600'
                  : 'bg-red-50 text-red-500'
              }`}>
                {entry.confidence}
              </span>
            </div>
            {entry.bulkBatchId && (
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
                <p className="text-xs text-gray-400">Bulk batch</p>
                <button
                  onClick={() => onNavigateToHistory?.({ bulkBatchId: entry.bulkBatchId })}
                  className="text-xs font-semibold text-indigo-500"
                >
                  View batch
                </button>
              </div>
            )}
          </div>

          {/* Delete confirm */}
          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-3">
              <p className="text-sm text-red-700 font-medium">
                Delete this entry? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          )}

          {showRecurring && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Make this recurring</p>
              <div className="grid grid-cols-3 gap-2">
                {(['daily', 'weekly', 'monthly'] as RecurringFrequency[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => setFrequency(option)}
                    className={`rounded-xl py-2 text-xs font-semibold capitalize ${
                      frequency === option ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="text-xs font-medium text-indigo-700">Next due date</span>
                <input
                  type="date"
                  value={nextDueDate}
                  onChange={(event) => setNextDueDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm text-gray-800 outline-none"
                />
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRecurring(false)}
                  className="flex-1 rounded-xl bg-white py-2 text-sm font-semibold text-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMakeRecurring}
                  className="flex-1 rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white"
                >
                  Save Rule
                </button>
              </div>
            </div>
          )}
    </ModalShell>
  )
}
