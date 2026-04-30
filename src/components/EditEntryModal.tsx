'use client'

import { useState } from 'react'
import { Category, Entry, EntryType } from '@/lib/types'
import TagInput from '@/components/TagInput'
import { updateEntry } from '@/lib/db'
import { useModalDismiss } from '@/lib/useModalDismiss'
import ModalShell from '@/components/ModalShell'


interface Props {
  entry: Entry
  categories: Category[]
  onSave: (entry: Entry) => void
  onCancel: () => void
}

export default function EditEntryModal({ entry, categories, onSave, onCancel }: Props) {
  const [type, setType] = useState<EntryType>(entry.type)
  const [amount, setAmount] = useState(String(entry.amount))
  const [categoryIds, setCategoryIds] = useState<string[]>(entry.categoryIds)
  const [date, setDate] = useState(entry.date)
  const [note, setNote] = useState(entry.note)
  const [tags, setTags] = useState<string[]>(entry.tags)
  const [saving, setSaving] = useState(false)

  const canSave = amount.trim() !== '' && Number(amount) > 0 && categoryIds.length > 0
  const isDirty =
    type !== entry.type ||
    amount !== String(entry.amount) ||
    JSON.stringify(categoryIds) !== JSON.stringify(entry.categoryIds) ||
    date !== entry.date ||
    note !== entry.note ||
    JSON.stringify(tags) !== JSON.stringify(entry.tags)
  const { requestClose, backdropProps } = useModalDismiss({ isDirty, onClose: onCancel })

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)

    const updated: Entry = {
      ...entry,
      type,
      amount: Number(amount),
      categoryIds,
      date,
      note,
      tags,
      updatedAt: Date.now(),
    }
    await updateEntry(updated, entry.tags)
    setSaving(false)
    onSave(updated)
  }

  return (
    <ModalShell
      title="Edit Entry"
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
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      }
    >

          {/* Type */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</p>
            <div className="flex gap-2">
              {(['expense', 'income'] as EntryType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    type === t
                      ? t === 'expense'
                        ? 'bg-red-50 text-red-600 border border-red-200'
                        : 'bg-green-50 text-green-600 border border-green-200'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {t === 'expense' ? '💸 Expense' : '💰 Income'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Amount</p>
            <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2.5">
              <span className="text-gray-400 text-sm mr-1">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-sm text-gray-800 outline-none"
                inputMode="decimal"
              />
            </div>
          </div>

          {/* Date */}
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

          {/* Categories */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categories</p>
            <div className="flex flex-wrap gap-2">
              {categories.filter((c) => !c.archived).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                    categoryIds.includes(cat.id)
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags</p>
            <TagInput
              tags={tags}
              onChange={setTags}
            />
          </div>

          {/* Note */}
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
