'use client'

import { useEffect, useState, useCallback } from 'react'
import { getLentBorrowed, addLentBorrowed, updateLentBorrowed, deleteLentBorrowed } from '@/lib/db'
import { LentBorrowed, LentBorrowedDirection } from '@/lib/types'
import { formatCurrency, formatDisplayDate, getTodayString } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'
import { useModalDismiss } from '@/lib/useModalDismiss'

type Tab = 'all' | 'lent' | 'borrowed'

export default function LentScreen() {
  const [records, setRecords] = useState<LentBorrowed[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [showSettled, setShowSettled] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LentBorrowed | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const all = await getLentBorrowed()
    setRecords(all)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleSettle = async (record: LentBorrowed) => {
    await updateLentBorrowed({
      ...record,
      settled: true,
      settledDate: getTodayString(),
      updatedAt: Date.now(),
    })
    await loadData()
    showToast('✅ Marked as settled')
  }

  const handleDelete = async (id: string) => {
    await deleteLentBorrowed(id)
    await loadData()
    showToast('🗑 Record deleted')
  }

  // Filter records
  const filtered = records.filter((r) => {
    if (activeTab !== 'all' && r.direction !== activeTab) return false
    return true
  })

  const active = filtered.filter((r) => !r.settled)
  const settled = filtered.filter((r) => r.settled)

  // Totals
  const totalLent = records
    .filter((r) => !r.settled && r.direction === 'lent')
    .reduce((s, r) => s + r.amount, 0)
  const totalBorrowed = records
    .filter((r) => !r.settled && r.direction === 'borrowed')
    .reduce((s, r) => s + r.amount, 0)

  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-xl font-bold text-gray-800">Lent and borrowed</h1>
          <button
            onClick={() => setShowAdd(true)}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white"
          >
            + Add
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-green-50 rounded-xl px-3 py-2">
            <p className="text-xs text-green-400 font-medium">Owed to me</p>
            <p className="truncate text-lg font-bold text-green-600">
              {formatCurrency(totalLent)}
            </p>
          </div>
          <div className="bg-red-50 rounded-xl px-3 py-2">
            <p className="text-xs text-red-400 font-medium">I owe</p>
            <p className="truncate text-lg font-bold text-red-500">
              {formatCurrency(totalBorrowed)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {(['all', 'lent', 'borrowed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                activeTab === t
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">

        {/* Active records */}
        {active.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-4xl">🤝</span>
            <p className="text-sm text-gray-400 text-center">
              No active records.{'\n'}Tap + to add.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((record) => (
              <RecordCard
                key={record.id}
                record={record}
                onSettle={() => handleSettle(record)}
                onEdit={() => setEditingRecord(record)}
                onDelete={() => handleDelete(record.id)}
              />
            ))}
          </div>
        )}

        {/* Settled records */}
        {settled.length > 0 && (
          <div>
            <button
              onClick={() => setShowSettled(!showSettled)}
              className="flex items-center gap-2 text-sm text-gray-400 font-medium w-full py-2"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showSettled ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Settled ({settled.length})
            </button>

            {showSettled && (
              <div className="space-y-2 mt-2">
                {settled.map((record) => (
                  <RecordCard
                    key={record.id}
                    record={record}
                    settled
                    onDelete={() => handleDelete(record.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(showAdd || editingRecord) && (
        <LentBorrowedModal
          record={editingRecord}
          onSave={async (record) => {
            if (editingRecord) {
              await updateLentBorrowed(record)
              showToast('✅ Record updated')
            } else {
              await addLentBorrowed(record)
              showToast('✅ Record added')
            }
            await loadData()
            setShowAdd(false)
            setEditingRecord(null)
          }}
          onCancel={() => {
            setShowAdd(false)
            setEditingRecord(null)
          }}
        />
      )}

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

// ── Record Card ──────────────────────────────────────────────
function RecordCard({
  record,
  settled = false,
  onSettle,
  onEdit,
  onDelete,
}: {
  record: LentBorrowed
  settled?: boolean
  onSettle?: () => void
  onEdit?: () => void
  onDelete: () => void
}) {
  const [showActions, setShowActions] = useState(false)

  return (
    <div className={`rounded-2xl bg-white px-4 py-3 shadow-sm ${settled ? 'opacity-60' : ''}`}>
      <div className="mobile-safe-row flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              record.direction === 'lent'
                ? 'bg-green-50 text-green-600'
                : 'bg-red-50 text-red-500'
            }`}>
              {record.direction === 'lent' ? 'Lent' : 'Borrowed'}
            </span>
            <p className="min-w-0 truncate text-sm font-semibold text-gray-800">
              {record.counterparty}
            </p>
          </div>
          {record.note && (
            <p className="mt-1 truncate text-xs text-gray-400">{record.note}</p>
          )}
          <p className="mt-1 truncate text-xs text-gray-300">
            {formatDisplayDate(record.date)}
            {settled && record.settledDate && (
              <span className="ml-2 text-green-400">
                · Settled {formatDisplayDate(record.settledDate)}
              </span>
            )}
          </p>
        </div>

        <div className="flex max-w-[42%] shrink-0 items-center gap-2">
          <p className={`truncate text-base font-bold ${
            record.direction === 'lent' ? 'text-green-600' : 'text-red-500'
          }`}>
            {formatCurrency(record.amount)}
          </p>
          <button
            onClick={() => setShowActions(!showActions)}
            className="text-gray-300 p-1"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-50 pt-3">
          {!settled && onSettle && (
            <button
              onClick={() => { onSettle(); setShowActions(false) }}
              className="min-w-[7rem] flex-1 rounded-xl bg-green-50 py-2 text-xs font-semibold text-green-600"
            >
              ✅ Mark Settled
            </button>
          )}
          {!settled && onEdit && (
            <button
              onClick={() => { onEdit(); setShowActions(false) }}
              className="min-w-[5rem] flex-1 rounded-xl bg-gray-100 py-2 text-xs font-semibold text-gray-600"
            >
              ✏️ Edit
            </button>
          )}
          <button
            onClick={() => { onDelete(); setShowActions(false) }}
            className="min-w-[5rem] flex-1 rounded-xl bg-red-50 py-2 text-xs font-semibold text-red-500"
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ── Add/Edit Modal ───────────────────────────────────────────
function LentBorrowedModal({
  record,
  onSave,
  onCancel,
}: {
  record: LentBorrowed | null
  onSave: (r: LentBorrowed) => void
  onCancel: () => void
}) {
  const [direction, setDirection] = useState<LentBorrowedDirection>(
    record?.direction ?? 'lent'
  )
  const [counterparty, setCounterparty] = useState(record?.counterparty ?? '')
  const [amount, setAmount] = useState(record ? String(record.amount) : '')
  const [date, setDate] = useState(record?.date ?? getTodayString())
  const [note, setNote] = useState(record?.note ?? '')
  const [saving, setSaving] = useState(false)

  const canSave = counterparty.trim() && amount && Number(amount) > 0
  const isDirty =
    direction !== (record?.direction ?? 'lent') ||
    counterparty !== (record?.counterparty ?? '') ||
    amount !== (record ? String(record.amount) : '') ||
    date !== (record?.date ?? getTodayString()) ||
    note !== (record?.note ?? '')
  const { requestClose, backdropProps } = useModalDismiss({ isDirty, onClose: onCancel })

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    const now = Date.now()
    const saved: LentBorrowed = record
      ? {
          ...record,
          direction,
          counterparty: counterparty.trim(),
          amount: Number(amount),
          date,
          note,
          updatedAt: now,
        }
      : {
          id: uuidv4(),
          direction,
          counterparty: counterparty.trim(),
          amount: Number(amount),
          date,
          note,
          settled: false,
          settledDate: null,
          createdAt: now,
          updatedAt: now,
        }
    setSaving(false)
    onSave(saved)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" {...backdropProps}>
      <div className="bg-white w-full max-w-120 rounded-t-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <button onClick={requestClose} className="text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="font-semibold text-gray-800">
            {record ? 'Edit Record' : 'Add Record'}
          </p>
          <div className="w-6" />
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* Direction */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Type
            </p>
            <div className="flex flex-wrap gap-2">
              {(['lent', 'borrowed'] as LentBorrowedDirection[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`min-w-[8rem] flex-1 rounded-xl py-2.5 text-sm font-semibold capitalize transition-colors ${
                    direction === d
                      ? d === 'lent'
                        ? 'bg-green-50 text-green-600 border border-green-200'
                        : 'bg-red-50 text-red-500 border border-red-200'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {d === 'lent' ? '🤲 I Lent' : '🙏 I Borrowed'}
                </button>
              ))}
            </div>
          </div>

          {/* Person */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Person
            </p>
            <input
              type="text"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Name"
              autoFocus
              className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
            />
          </div>

          {/* Amount */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Amount
            </p>
            <div className="flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-2.5">
              <span className="text-gray-400 text-sm">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none"
                inputMode="numeric"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Date
            </p>
            <div className="bg-gray-100 rounded-xl px-3 py-2.5">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-transparent text-sm text-gray-800 outline-none"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Note (optional)
            </p>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Kis liye tha?"
              className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-4 pb-6">
          <button
            onClick={requestClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
