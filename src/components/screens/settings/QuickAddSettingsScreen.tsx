'use client'

import { useEffect, useState, useCallback } from 'react'
import { getQuickAddTiles, deleteQuickAddTile, upsertQuickAddTile, getCategories, getSetting, setSetting } from '@/lib/db'
import { QuickAddTile, Category } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  onBack: () => void
}

const getTileAmountMode = (tile: QuickAddTile) =>
  tile.amountMode ?? (tile.pinnedManually ? 'fixed' : 'edit')

const amountModeText = (tile: QuickAddTile) =>
  getTileAmountMode(tile) === 'fixed' ? 'fixed amount' : 'edit amount'

export default function QuickAddSettingsScreen({ onBack }: Props) {
  const [tiles, setTiles] = useState<QuickAddTile[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [autoDetect, setAutoDetect] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingTile, setEditingTile] = useState<QuickAddTile | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // New tile form state
  const [newAmount, setNewAmount] = useState('')
  const [newCategoryIds, setNewCategoryIds] = useState<string[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('📦')
  const [newNote, setNewNote] = useState('')
  const [newAmountMode, setNewAmountMode] = useState<'fixed' | 'edit'>('fixed')
  const [saving, setSaving] = useState(false)
  const canAddTile = Number(newAmount) > 0 && Boolean(newLabel.trim()) && newCategoryIds.length > 0

  const EMOJI_OPTIONS = ['☕','🚗','🍔','🏸','🛒','🍕','🎬','💊','📚','🏠','✈️','🍺','🎮','🐾','💄']

  const loadData = useCallback(async () => {
    const [t, cats, auto] = await Promise.all([
      getQuickAddTiles(20),
      getCategories(),
      getSetting('quickAddAutoDetect'),
    ])
    setTiles(t)
    setCategories(cats.filter((c) => !c.archived))
    setAutoDetect(auto !== false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleToggleAutoDetect = async (val: boolean) => {
    setAutoDetect(val)
    await setSetting('quickAddAutoDetect', val)
  }

  const handleDelete = async (id: string) => {
    await deleteQuickAddTile(id)
    await loadData()
    showToast('Action removed')
  }

  const handleAddTile = async () => {
    if (!canAddTile) return
    setSaving(true)
    const now = Date.now()
    const tile: QuickAddTile = {
      id: uuidv4(),
      amount: Number(newAmount),
      amountMode: newAmountMode,
      categoryIds: newCategoryIds,
      tags: [],
      note: newNote,
      displayLabel: newLabel.trim(),
      emoji: newEmoji,
      pinnedManually: true,
      usageCount: 0,
      lastUsedAt: now,
      displayOrder: tiles.length + 1,
      createdAt: now,
    }
    await upsertQuickAddTile(tile)
    await loadData()
    setShowAdd(false)
    setNewAmount('')
    setNewCategoryIds([])
    setNewLabel('')
    setNewEmoji('📦')
    setNewNote('')
    setNewAmountMode('fixed')
    setSaving(false)
    showToast('Action added')
  }

  const toggleNewCategory = (id: string) => {
    setNewCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-indigo-500 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-800">Quick Actions</h1>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 bg-indigo-500 text-white text-sm font-semibold px-3 py-1.5 rounded-xl"
          >
            + Add
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Auto-detect toggle */}
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Auto-detect actions</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Auto-add actions for entries logged 3+ times in 30 days
              </p>
            </div>
            <button
              onClick={() => handleToggleAutoDetect(!autoDetect)}
              className={`w-12 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                autoDetect ? 'bg-indigo-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  autoDetect ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Tiles list */}
        {tiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-4xl">⚡</span>
            <p className="text-sm text-gray-400 text-center">
              No actions yet. Log the same expense 3+ times and it appears here automatically.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Create first action
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {tiles.map((tile, i) => (
              <div
                key={tile.id}
                className={`flex items-center justify-between px-4 py-3.5 ${
                  i < tiles.length - 1 ? 'border-b border-gray-50' : ''
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="text-xl">{tile.emoji}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-700">
                      {tile.displayLabel}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(tile.amount)} · {amountModeText(tile)} ·{' '}
                      {tile.pinnedManually ? (
                        <span className="text-indigo-400">pinned</span>
                      ) : (
                        `${tile.usageCount} uses`
                      )}
                    </p>
                  </div>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setEditingTile(tile)}
                    className="rounded-lg bg-gray-50 px-2 py-1 text-xs font-medium text-gray-500"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(tile.id)}
                    className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Tile Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40">
          <div className="bg-white w-full max-w-120 rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <button onClick={() => setShowAdd(false)} className="text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <p className="font-semibold text-gray-800">Add action</p>
              <div className="w-6" />
            </div>

            <div className="px-4 py-4 space-y-4">

              {/* Label */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Label</p>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Chai, Auto, Lunch"
                  autoFocus
                  className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
                />
              </div>

              {/* Amount */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Amount</p>
                <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2.5 gap-1">
                  <span className="text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0"
                    className="flex-1 bg-transparent text-sm text-gray-800 outline-none"
                    inputMode="numeric"
                  />
                </div>
              </div>

              {/* Amount Mode */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Amount mode</p>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                  {(['fixed', 'edit'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setNewAmountMode(mode)}
                      className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                        newAmountMode === mode
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-gray-400'
                      }`}
                    >
                      {mode === 'fixed' ? 'Fixed amount' : 'Edit amount'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Emoji */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Emoji — {newEmoji}
                </p>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setNewEmoji(e)}
                      className={`text-xl w-10 h-10 rounded-xl flex items-center justify-center ${
                        newEmoji === e ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-100'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => toggleNewCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                        newCategoryIds.includes(cat.id)
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

              {/* Note */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Default note (optional)
                </p>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="e.g. morning chai"
                  className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
                />
              </div>
            </div>

            <div className="px-4 pb-6">
              <button
                onClick={handleAddTile}
                disabled={!canAddTile || saving}
                className="w-full py-3 bg-indigo-500 text-white rounded-xl font-semibold text-sm disabled:opacity-40"
              >
                {saving ? 'Adding...' : 'Add action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTile && (
        <QuickAddSettingsEditModal
          tile={editingTile}
          categories={categories}
          onCancel={() => setEditingTile(null)}
          onSave={async (tile) => {
            await upsertQuickAddTile(tile)
            await loadData()
            setEditingTile(null)
            showToast('Action updated')
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

function QuickAddSettingsEditModal({
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
  const [amountMode, setAmountMode] = useState(getTileAmountMode(tile))
  const [categoryIds, setCategoryIds] = useState<string[]>(tile.categoryIds)
  const [displayLabel, setDisplayLabel] = useState(tile.displayLabel)
  const [emoji, setEmoji] = useState(tile.emoji)
  const [note, setNote] = useState(tile.note)
  const emojiOptions = ['☕','🚗','🍔','🏸','🛒','🍕','🎬','💊','📚','🏠','✈️','🍺','🎮','🐾','💄']
  const canSave = Number(amount) > 0 && displayLabel.trim() && categoryIds.length > 0

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((catId) => catId !== id) : [...prev, id]
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={onCancel}>
      <div className="max-h-[90vh] w-full max-w-120 overflow-y-auto rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4">
          <button onClick={onCancel} className="text-gray-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="font-semibold text-gray-800">Edit action</p>
          <div className="w-6" />
        </div>

        <div className="space-y-4 px-4 py-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Label</span>
            <input
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
              className="mt-2 w-full rounded-xl bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</span>
            <div className="mt-2 flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-2.5">
              <span className="text-sm text-gray-400">₹</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none"
                inputMode="decimal"
              />
            </div>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Emoji</p>
            <div className="flex flex-wrap gap-2">
              {emojiOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setEmoji(option)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${
                    emoji === option ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-100'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Categories</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => toggleCategory(category.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
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
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Default note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 w-full rounded-xl bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none"
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
            className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save action
          </button>
        </div>
      </div>
    </div>
  )
}
