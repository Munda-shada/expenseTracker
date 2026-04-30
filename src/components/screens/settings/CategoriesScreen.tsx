'use client'

import { useEffect, useState, useCallback } from 'react'
import { getCategories } from '@/lib/db'
import { Category } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  onBack: () => void
}

const EMOJI_OPTIONS = [
  '🍔','🚗','🛍️','💊','🎬','🧾','🏸','📚','💰','💻','📦',
  '✈️','🍕','🎵','🏠','💄','🐾','🌿','🍺','☕','🎮','🏋️',
]

export default function CategoriesScreen({ onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('📦')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const cats = await getCategories()
    setCategories(cats)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const db = await import('@/lib/db').then((m) => m.getDB())
    const now = Date.now()
    const maxOrder = Math.max(...categories.map((c) => c.displayOrder), 0)
    const cat: Category = {
      id: uuidv4(),
      name: newName.trim(),
      emoji: newEmoji,
      isDefault: false,
      displayOrder: maxOrder + 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }
    await db.put('categories', cat)
    await loadData()
    setNewName('')
    setNewEmoji('📦')
    setShowAdd(false)
    setSaving(false)
    showToast('✅ Category added')
  }

  const toggleArchive = async (cat: Category) => {
    if (cat.id === 'cat-other') {
      showToast('⚠️ Cannot archive the Other category')
      return
    }
    const db = await import('@/lib/db').then((m) => m.getDB())
    await db.put('categories', {
      ...cat,
      archived: !cat.archived,
      updatedAt: Date.now(),
    })
    await loadData()
    showToast(cat.archived ? '✅ Category restored' : '🗃 Category archived')
  }

  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)

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
            <h1 className="text-xl font-bold text-gray-800">Categories</h1>
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

        {/* Active */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {active.map((cat, i) => (
            <div
              key={cat.id}
              className={`flex items-center justify-between px-4 py-3.5 ${
                i < active.length - 1 ? 'border-b border-gray-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{cat.emoji}</span>
                <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                {cat.isDefault && (
                  <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                    default
                  </span>
                )}
              </div>
              {cat.id !== 'cat-other' && (
                <button
                  onClick={() => toggleArchive(cat)}
                  className="text-xs text-gray-400 font-medium px-2 py-1 rounded-lg bg-gray-50"
                >
                  Archive
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Archived */}
        {archived.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
              Archived
            </p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {archived.map((cat, i) => (
                <div
                  key={cat.id}
                  className={`flex items-center justify-between px-4 py-3.5 opacity-50 ${
                    i < archived.length - 1 ? 'border-b border-gray-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat.emoji}</span>
                    <span className="text-sm font-medium text-gray-700 line-through">
                      {cat.name}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleArchive(cat)}
                    className="text-xs text-indigo-500 font-medium px-2 py-1 rounded-lg bg-indigo-50"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Category Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40">
          <div className="bg-white w-full max-w-120 rounded-t-2xl">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <button onClick={() => setShowAdd(false)} className="text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <p className="font-semibold text-gray-800">Add Category</p>
              <div className="w-6" />
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* Name */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Name</p>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Gym, Coffee, Petrol"
                  autoFocus
                  className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none"
                />
              </div>

              {/* Emoji picker */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Emoji — selected: {newEmoji}
                </p>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setNewEmoji(e)}
                      className={`text-xl w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                        newEmoji === e ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-100'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 pb-6">
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || saving}
                className="w-full py-3 bg-indigo-500 text-white rounded-xl font-semibold text-sm disabled:opacity-40"
              >
                {saving ? 'Adding...' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
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
