'use client'

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { addEntry } from '@/lib/db'
import { getTodayString } from '@/lib/utils'
import { Category, DEFAULT_PAYMENT_METHOD, Entry, EntryType, PaymentMethod } from '@/lib/types'
import TagInput from '@/components/TagInput'
import { useModalDismiss } from '@/lib/useModalDismiss'
import ModalShell from '@/components/ModalShell'
import PaymentMethodInput from '@/components/PaymentMethodInput'

interface Props {
  categories: Category[]
  initialRawInput?: string
  onSave: (entry: Entry) => void
  onCancel: () => void
}

export default function ManualEntryModal({
  categories,
  initialRawInput = '',
  onSave,
  onCancel,
}: Props) {
  const [type, setType] = useState<EntryType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD)
  const [date, setDate] = useState(getTodayString())
  const [note, setNote] = useState(initialRawInput.slice(0, 100))
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const canSave = amount.trim() !== '' && Number(amount) > 0 && categoryIds.length > 0
  const isDirty =
    type !== 'expense' ||
    amount.trim() !== '' ||
    categoryIds.length > 0 ||
    paymentMethod !== DEFAULT_PAYMENT_METHOD ||
    note !== initialRawInput.slice(0, 100) ||
    tags.length > 0
  const { requestClose, backdropProps } = useModalDismiss({ isDirty, onClose: onCancel })

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)

    const now = Date.now()
    const rawInput = initialRawInput.trim() || `manual: ${note.trim() || 'entry'}`
    const entry: Entry = {
      id: uuidv4(),
      type,
      amount: Number(amount),
      categoryIds,
      paymentMethod,
      tags,
      date,
      note: note.trim(),
      rawInput,
      confidence: 'high',
      source: 'manual',
      bulkBatchId: null,
      pending: false,
      createdAt: now,
      updatedAt: now,
    }

    await addEntry(entry)
    setSaving(false)
    onSave(entry)
  }

  return (
    <ModalShell
      title="Manual entry"
      onClose={requestClose}
      backdropProps={backdropProps}
      footer={
        <div className="flex gap-3">
          <button
            onClick={requestClose}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-transform active:scale-95 disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      }
    >
          {initialRawInput.trim() && (
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-400 mb-0.5">Original input</p>
              <p className="text-sm text-gray-600 italic">&quot;{initialRawInput}&quot;</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</p>
            <div className="flex gap-2">
              {(['expense', 'income'] as EntryType[]).map((entryType) => (
                <button
                  key={entryType}
                  onClick={() => setType(entryType)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    type === entryType
                      ? entryType === 'expense'
                        ? 'bg-red-50 text-red-600 border border-red-200'
                        : 'bg-green-50 text-green-600 border border-green-200'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {entryType === 'expense' ? '💸 Expense' : '💰 Income'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Amount</p>
            <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2.5">
              <span className="text-gray-400 text-sm mr-1">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="flex-1 bg-transparent text-sm text-gray-800 outline-none"
                inputMode="decimal"
                autoFocus
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Date</p>
            <div className="bg-gray-100 rounded-xl px-3 py-2.5">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-transparent text-sm text-gray-800 outline-none"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categories</p>
            <div className="flex flex-wrap gap-2">
              {categories
                .filter((category) => !category.archived)
                .map((category) => (
                  <button
                    key={category.id}
                    onClick={() => toggleCategory(category.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                      categoryIds.includes(category.id)
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <span>{category.emoji}</span>
                    <span>{category.name}</span>
                  </button>
                ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags</p>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          <PaymentMethodInput value={paymentMethod} onChange={setPaymentMethod} />

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Note</p>
            <div className="bg-gray-100 rounded-xl px-3 py-2.5">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 100))}
                placeholder="Short note..."
                className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
              />
            </div>
          </div>
    </ModalShell>
  )
}
