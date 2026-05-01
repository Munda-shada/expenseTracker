'use client'

import { useEffect, useRef, useState } from 'react'
import { Bolt, Plus, Trash2 } from 'lucide-react'
import { DEFAULT_PAYMENT_METHOD, QuickAddTile, Category, Entry } from '@/lib/types'
import { getQuickAddTiles, upsertQuickAddTile, deleteQuickAddTile, addEntry } from '@/lib/db'
import { getTodayString, formatCurrency } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  categories: Category[]
  onSaved: (entry: Entry) => void
  onShowToast: (msg: string) => void
  onNavigateToHistory?: (filters: object) => void
}

const getTileAmountMode = (tile: QuickAddTile) =>
  tile.amountMode ?? (tile.pinnedManually ? 'fixed' : 'edit')

const getAmountModeLabel = (tile: QuickAddTile) =>
  getTileAmountMode(tile) === 'fixed' ? 'fixed amount' : 'edit amount'

export default function QuickAddTileRow({ categories, onSaved, onShowToast, onNavigateToHistory }: Props) {
  const [tiles, setTiles] = useState<QuickAddTile[]>([])
  const [actionSheet, setActionSheet] = useState<QuickAddTile | null>(null)
  const [editingTile, setEditingTile] = useState<QuickAddTile | null>(null)
  const [amountSheetTile, setAmountSheetTile] = useState<QuickAddTile | null>(null)
  const [amountDraft, setAmountDraft] = useState('')
  const [amountSaving, setAmountSaving] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  const loadTiles = async () => {
    const t = await getQuickAddTiles(6)
    setTiles(t)
  }

  useEffect(() => { loadTiles() }, [])

  const getCategoryShortName = (tile: QuickAddTile) => {
    const cat = categories.find((c) => c.id === tile.categoryIds[0])
    return cat?.name ?? tile.displayLabel
  }

  const saveTileEntry = async (tile: QuickAddTile, amount: number) => {
    const now = Date.now()
    const entry: Entry = {
      id: uuidv4(),
      type: 'expense',
      amount,
      categoryIds: tile.categoryIds,
      paymentMethod: DEFAULT_PAYMENT_METHOD,
      tags: tile.tags,
      date: getTodayString(),
      note: tile.note,
      rawInput: `quick-action: ${tile.displayLabel}`,
      confidence: 'high',
      source: 'quickAdd',
      bulkBatchId: null,
      pending: false,
      createdAt: now,
      updatedAt: now,
    }

    await addEntry(entry)

    // Increment tile usage
    await upsertQuickAddTile({
      ...tile,
      amountMode: getTileAmountMode(tile),
      usageCount: tile.usageCount + 1,
      lastUsedAt: now,
    })

    await loadTiles()
    onSaved(entry)
  }

  const openAmountSheet = (tile: QuickAddTile) => {
    setAmountDraft(String(tile.amount))
    setAmountSheetTile(tile)
  }

  const handleTap = async (tile: QuickAddTile) => {
    if (getTileAmountMode(tile) === 'edit') {
      openAmountSheet(tile)
      return
    }
    await saveTileEntry(tile, tile.amount)
  }

  const handleAmountSave = async () => {
    if (!amountSheetTile || Number(amountDraft) <= 0) return
    setAmountSaving(true)
    await saveTileEntry(amountSheetTile, Number(amountDraft))
    setAmountSaving(false)
    setAmountSheetTile(null)
    setAmountDraft('')
  }

  const handleLongPressStart = (tile: QuickAddTile) => {
    longPressTriggeredRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      setActionSheet(tile)
    }, 500)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  const handleViewLikeThis = (tile: QuickAddTile) => {
    setActionSheet(null)
    onNavigateToHistory?.({
      type: 'expense',
      amountMin: String(tile.amount),
      amountMax: String(tile.amount),
      categoryIds: tile.categoryIds,
    })
  }

  const handleRemove = async (tile: QuickAddTile) => {
    await deleteQuickAddTile(tile.id)
    await loadTiles()
    setActionSheet(null)
    onShowToast('Action removed')
  }

  if (tiles.length === 0) {
    return (
      <div className="px-4 pt-3">
        <button
          onClick={() => onShowToast('Create your first Quick Action in Settings.')}
          className="dashboard-panel flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Plus className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">Create Quick Actions</span>
            <span className="block text-xs text-slate-500">Pin frequent spends for one-tap logging.</span>
          </span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 pt-3 pb-1">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
          <Bolt className="h-3.5 w-3.5" /> Quick Actions
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              onMouseDown={() => handleLongPressStart(tile)}
              onMouseUp={() => {
                handleLongPressEnd()
                if (!longPressTriggeredRef.current) handleTap(tile)
              }}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={() => handleLongPressStart(tile)}
              onTouchEnd={(e) => {
                e.preventDefault()
                handleLongPressEnd()
                if (!longPressTriggeredRef.current) handleTap(tile)
              }}
              aria-label={`Quick Action ${formatCurrency(tile.amount)} ${getCategoryShortName(tile)}`}
              className="min-w-24 shrink-0 select-none rounded-3xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition-transform active:scale-95"
            >
              <span className="text-xl">{tile.emoji}</span>
              <span className="mt-1 block text-sm font-black text-slate-900">
                {formatCurrency(tile.amount)}
              </span>
              <span className="block max-w-20 truncate text-[11px] font-medium text-slate-500">
                {getCategoryShortName(tile)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Long press action sheet */}
      {actionSheet && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
          onClick={() => setActionSheet(null)}
        >
          <div
            className="bg-white w-full max-w-120 rounded-t-2xl pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800 text-center">
                {actionSheet.emoji} {actionSheet.displayLabel}
              </p>
              <p className="text-xs text-gray-400 text-center mt-0.5">
                {formatCurrency(actionSheet.amount)} · {getAmountModeLabel(actionSheet)} · {actionSheet.usageCount} uses
              </p>
            </div>
            <div className="px-4 pt-3 space-y-2">
              <button
                onClick={() => {
                  setEditingTile(actionSheet)
                  setActionSheet(null)
                }}
                className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold"
              >
                Edit action
              </button>
              <button
                onClick={() => handleViewLikeThis(actionSheet)}
                className="w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-semibold"
              >
                View entries like this
              </button>
              <button
                onClick={async () => {
                  if (getTileAmountMode(actionSheet) === 'edit') {
                    openAmountSheet(actionSheet)
                  } else {
                    await saveTileEntry(actionSheet, actionSheet.amount)
                  }
                  setActionSheet(null)
                }}
                className="w-full py-3 rounded-xl bg-indigo-500 text-white text-sm font-semibold"
              >
                {getTileAmountMode(actionSheet) === 'edit' ? 'Edit amount' : 'Add now'}
              </button>
              <button
                onClick={() => handleRemove(actionSheet)}
                className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-semibold"
              >
                <span className="inline-flex items-center justify-center gap-2"><Trash2 className="h-4 w-4" /> Remove Quick Action</span>
              </button>
              <button
                onClick={() => setActionSheet(null)}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-500 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTile && (
        <QuickAddEditModal
          tile={editingTile}
          categories={categories}
          onCancel={() => setEditingTile(null)}
          onSave={async (tile) => {
            await upsertQuickAddTile(tile)
            await loadTiles()
            setEditingTile(null)
            onShowToast('Action updated')
          }}
        />
      )}

      {amountSheetTile && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40"
          onClick={() => setAmountSheetTile(null)}
        >
          <div
            className="w-full max-w-120 rounded-t-2xl bg-white px-4 pb-6 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-center">
              <p className="text-lg font-semibold text-gray-800">
                {amountSheetTile.emoji} {amountSheetTile.displayLabel}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {getCategoryShortName(amountSheetTile)}
              </p>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</span>
              <div className="mt-2 flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-2.5">
                <span className="text-sm text-gray-400">₹</span>
                <input
                  type="number"
                  value={amountDraft}
                  onChange={(e) => setAmountDraft(e.target.value)}
                  inputMode="decimal"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none"
                />
              </div>
            </label>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setAmountSheetTile(null)}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleAmountSave}
                disabled={Number(amountDraft) <= 0 || amountSaving}
                className="flex-1 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {amountSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function QuickAddEditModal({
  tile,
  categories,
  onSave,
  onCancel,
}: {
  tile: QuickAddTile
  categories: Category[]
  onSave: (tile: QuickAddTile) => void
  onCancel: () => void
}) {
  const [amount, setAmount] = useState(String(tile.amount))
  const [categoryIds, setCategoryIds] = useState<string[]>(tile.categoryIds)
  const [displayLabel, setDisplayLabel] = useState(tile.displayLabel)
  const [emoji, setEmoji] = useState(tile.emoji)
  const [note, setNote] = useState(tile.note)
  const [amountMode, setAmountMode] = useState(getTileAmountMode(tile))
  const emojiOptions = ['☕','🚗','🍔','🏸','🛒','🍕','🎬','💊','📚','🏠','✈️','🍺','🎮','🐾','💄']
  const canSave = Number(amount) > 0 && displayLabel.trim() && categoryIds.length > 0

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id]
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white w-full max-w-120 rounded-t-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <button onClick={onCancel} className="text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="font-semibold text-gray-800">Edit action</p>
          <div className="w-6" />
        </div>
        <div className="px-4 py-4 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Label</span>
            <input
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
              className="mt-2 w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2 w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
            />
          </label>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Amount mode</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
              {(['fixed', 'edit'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAmountMode(mode)}
                  className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                    amountMode === mode
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-gray-400'
                  }`}
                >
                  {mode === 'fixed' ? 'Fixed amount' : 'Edit amount'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Emoji</p>
            <div className="flex flex-wrap gap-2">
              {emojiOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setEmoji(option)}
                  className={`text-xl w-10 h-10 rounded-xl flex items-center justify-center ${
                    emoji === option ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-100'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Categories</p>
            <div className="flex flex-wrap gap-2">
              {categories.filter((category) => !category.archived).map((category) => (
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
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Default note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
            />
          </label>
        </div>
        <div className="px-4 pb-6">
          <button
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return
              onSave({
                ...tile,
                amount: Number(amount),
                amountMode,
                categoryIds,
                displayLabel: displayLabel.trim(),
                emoji,
                note,
                pinnedManually: true,
              })
            }}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl font-semibold text-sm disabled:opacity-40"
          >
            Save action
          </button>
        </div>
      </div>
    </div>
  )
}
