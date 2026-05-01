'use client'

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Category, DEFAULT_PAYMENT_METHOD, Entry, EntryType, ConfidenceLevel, PaymentMethod, getPaymentMethodLabel } from '@/lib/types'
import { addEntry, addCorrection } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'
import TagInput from '@/components/TagInput'
import { useModalDismiss } from '@/lib/useModalDismiss'
import ModalShell from '@/components/ModalShell'
import PaymentMethodInput from '@/components/PaymentMethodInput'


interface ParsedEntry {
  type: EntryType
  amount: number
  categoryIds: string[]
  paymentMethod?: PaymentMethod | null
  date: string
  note: string
  tags: string[]
  confidence: ConfidenceLevel
}

interface RowState extends ParsedEntry {
  rowId: string // local UI id
  originalIndex: number
}

interface Props {
  rawInput: string
  parsed: ParsedEntry[]
  categories: Category[]
  onSave: (entries: Entry[]) => void
  onCancel: () => void
}

export default function BulkConfirmModal({
  rawInput,
  parsed,
  categories,
  onSave,
  onCancel,
}: Props) {
  const [rows, setRows] = useState<RowState[]>(() =>
    parsed.map((p, originalIndex) => ({ ...p, rowId: uuidv4(), originalIndex }))
  )
  const [expandedRow, setExpandedRow] = useState<string | null>(
    // Auto-expand low confidence rows
    () => rows.find((row) => row.confidence === 'low')?.rowId ?? null
  )
  const [saving, setSaving] = useState(false)

  const isValidRow = (row: RowState) =>
    Number.isFinite(Number(row.amount)) &&
    Number(row.amount) > 0 &&
    row.categoryIds.length > 0 &&
    row.date.trim() !== ''
  const canSave = rows.length > 0 && rows.every(isValidRow)
  const comparableRows = rows.map((row) => ({
    type: row.type,
    amount: row.amount,
    categoryIds: row.categoryIds,
    paymentMethod: row.paymentMethod ?? DEFAULT_PAYMENT_METHOD,
    date: row.date,
    note: row.note,
    tags: row.tags,
    confidence: row.confidence,
  }))
  const isDirty = JSON.stringify(comparableRows) !== JSON.stringify(parsed)
  const { requestClose, backdropProps } = useModalDismiss({ isDirty, onClose: onCancel })

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId))
  }

  const updateRow = (rowId: string, updates: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, ...updates } : r))
    )
  }

  const toggleCategory = (rowId: string, catId: string) => {
    const row = rows.find((r) => r.rowId === rowId)
    if (!row) return
    const newIds = row.categoryIds.includes(catId)
      ? row.categoryIds.filter((id) => id !== catId)
      : [...row.categoryIds, catId]
    updateRow(rowId, { categoryIds: newIds })
  }

  const getCategoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? id

  const handleSaveAll = async () => {
    if (!canSave) return
    setSaving(true)

    const bulkBatchId = uuidv4()
    const now = Date.now()
    const entries: Entry[] = []

    for (const row of rows) {
      const savedRow: ParsedEntry = {
        type: row.type,
        amount: row.amount,
        categoryIds: row.categoryIds,
        paymentMethod: row.paymentMethod ?? DEFAULT_PAYMENT_METHOD,
        date: row.date,
        note: row.note,
        tags: row.tags,
        confidence: row.confidence,
      }
      const entry: Entry = {
        id: uuidv4(),
        type: savedRow.type,
        amount: Number(savedRow.amount),
        categoryIds: savedRow.categoryIds,
        paymentMethod: savedRow.paymentMethod ?? DEFAULT_PAYMENT_METHOD,
        tags: savedRow.tags,
        date: savedRow.date,
        note: savedRow.note,
        rawInput,
        confidence: savedRow.confidence,
        source: 'bulk',
        bulkBatchId,
        pending: false,
        createdAt: now,
        updatedAt: now,
      }
      entries.push(entry)
      await addEntry(entry)

      const original = parsed[row.originalIndex]
      if (original) {
        const correctedFields: string[] = []
        if (savedRow.type !== original.type) correctedFields.push('type')
        if (Number(savedRow.amount) !== original.amount) correctedFields.push('amount')
        if (JSON.stringify(savedRow.categoryIds) !== JSON.stringify(original.categoryIds)) {
          correctedFields.push('categoryIds')
        }
        if ((savedRow.paymentMethod ?? DEFAULT_PAYMENT_METHOD) !== (original.paymentMethod ?? DEFAULT_PAYMENT_METHOD)) {
          correctedFields.push('paymentMethod')
        }
        if (savedRow.date !== original.date) correctedFields.push('date')
        if (savedRow.note !== original.note) correctedFields.push('note')
        if (JSON.stringify(savedRow.tags) !== JSON.stringify(original.tags)) correctedFields.push('tags')

        if (correctedFields.length > 0) {
          await addCorrection({
            id: uuidv4(),
            rawInput,
            aiOutput: original,
            userCorrected: savedRow,
            correctedFields,
            createdAt: now,
          })
        }
      }
    }

    setSaving(false)
    onSave(entries)
  }

  return (
    <ModalShell
      title={`Bulk entry (${rows.length})`}
      onClose={requestClose}
      backdropProps={backdropProps}
      bodyClassName="px-4 pt-3 pb-4 space-y-3"
      footer={
        <div className="flex gap-3">
          <button
            onClick={requestClose}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAll}
            disabled={!canSave || saving}
            className="flex-1 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-transform active:scale-95 disabled:opacity-40"
          >
            {saving ? 'Saving...' : `Save All (${rows.length})`}
          </button>
        </div>
      }
    >
        {/* Original input input */}
        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-xs text-gray-400 mb-0.5">Original input</p>
          <p className="text-sm text-gray-600 italic">&quot;{rawInput}&quot;</p>
        </div>

        {/* Info banner */}
        <div className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2">
          <span className="text-indigo-400">ℹ️</span>
          <p className="text-xs text-indigo-600">
            Found {rows.length} entries. Review and edit each, then save all.
          </p>
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <span className="text-3xl">🗑️</span>
              <p className="text-sm text-gray-400">Saari entries hata di</p>
            </div>
          ) : (
            rows.map((row, index) => (
              <div
                key={row.rowId}
                className={`overflow-hidden rounded-2xl bg-gray-50 ${
                  isValidRow(row) ? '' : 'ring-1 ring-red-200'
                }`}
              >
                {/* Row header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-bold text-indigo-400 w-5">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {formatCurrency(Number(row.amount))}
                        <span className="text-gray-400 font-normal ml-1 text-xs">
                          · {row.categoryIds.map(getCategoryName).join(', ')}
                          · {getPaymentMethodLabel(row.paymentMethod ?? DEFAULT_PAYMENT_METHOD)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 truncate">{row.note}</p>
                      {!isValidRow(row) && (
                        <p className="mt-1 text-xs font-medium text-red-500">
                          Add amount, date, and category before saving.
                        </p>
                      )}
                    </div>
                    {row.confidence === 'low' && (
                      <span className="text-yellow-500 text-sm shrink-0">⚠️</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={() =>
                        setExpandedRow(
                          expandedRow === row.rowId ? null : row.rowId
                        )
                      }
                      className="text-xs text-indigo-500 font-medium px-2 py-1 bg-white rounded-lg"
                    >
                      {expandedRow === row.rowId ? 'Done' : 'Edit'}
                    </button>
                    <button
                      onClick={() => removeRow(row.rowId)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expanded edit */}
                {expandedRow === row.rowId && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100">

                    {/* Type */}
                    <div className="pt-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Type</p>
                      <div className="flex gap-2">
                        {(['expense', 'income'] as EntryType[]).map((t) => (
                          <button
                            key={t}
                            onClick={() => updateRow(row.rowId, { type: t })}
                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                              row.type === t
                                ? t === 'expense'
                                  ? 'bg-red-50 text-red-600 border border-red-200'
                                  : 'bg-green-50 text-green-600 border border-green-200'
                                : 'bg-white text-gray-400'
                            }`}
                          >
                            {t === 'expense' ? '💸 Expense' : '💰 Income'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Amount */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Amount</p>
                      <div className="flex items-center bg-white rounded-xl px-3 py-2.5 gap-1">
                        <span className="text-gray-400 text-sm">₹</span>
                        <input
                          type="number"
                          value={row.amount}
                          onChange={(e) =>
                            updateRow(row.rowId, { amount: Number(e.target.value) })
                          }
                          className="flex-1 bg-transparent text-sm text-gray-800 outline-none"
                          inputMode="decimal"
                        />
                      </div>
                    </div>

                    {/* Date */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Date</p>
                      <div className="bg-white rounded-xl px-3 py-2.5">
                        <input
                          type="date"
                          value={row.date}
                          onChange={(e) =>
                            updateRow(row.rowId, { date: e.target.value })
                          }
                          className="w-full bg-transparent text-sm text-gray-800 outline-none"
                        />
                      </div>
                    </div>

                    {/* Categories */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Categories</p>
                      <div className="flex flex-wrap gap-1.5">
                        {categories
                          .filter((c) => !c.archived)
                          .map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => toggleCategory(row.rowId, cat.id)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
                                row.categoryIds.includes(cat.id)
                                  ? 'bg-indigo-500 text-white'
                                  : 'bg-white text-gray-600'
                              }`}
                            >
                              <span>{cat.emoji}</span>
                              <span>{cat.name}</span>
                            </button>
                          ))}
                      </div>
                    </div>

                    <PaymentMethodInput
                      value={row.paymentMethod ?? DEFAULT_PAYMENT_METHOD}
                      onChange={(paymentMethod) => updateRow(row.rowId, { paymentMethod })}
                      compact
                    />

                    {/* Note */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Note</p>
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) =>
                          updateRow(row.rowId, { note: e.target.value.slice(0, 100) })
                        }
                        placeholder="Short note..."
                        className="w-full bg-white rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
                      />
                    </div>
                    {/* Tags */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tags</p>
                      <TagInput
                        tags={row.tags}
                        onChange={(newTags) => updateRow(row.rowId, { tags: newTags })}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
    </ModalShell>
  )
}
