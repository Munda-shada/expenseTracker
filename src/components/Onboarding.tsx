'use client'

import { useState } from 'react'
import { setSetting, getCategories, getDB } from '@/lib/db'
import { Category } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('📦')
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [reminderTime, setReminderTime] = useState('21:00')
  const [loading, setLoading] = useState(false)

  const emojiOptions = ['🍔', '🚗', '🛍️', '💊', '🎬', '🧾', '🏸', '📚', '💰', '☕', '📦']

  // Load categories when entering step 2
  const goToStep2 = async () => {
    const cats = await getCategories()
    setCategories(cats)
    setStep(2)
  }

  const reloadCategories = async () => {
    const cats = await getCategories()
    setCategories(cats)
  }

  const toggleCategoryArchived = async (category: Category) => {
    if (category.id === 'cat-other') return
    const db = await getDB()
    await db.put('categories', {
      ...category,
      archived: !category.archived,
      updatedAt: new Date().getTime(),
    })
    await reloadCategories()
  }

  const addCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return

    const db = await getDB()
    const now = new Date().getTime()
    const maxOrder = Math.max(...categories.map((c) => c.displayOrder), 0)
    await db.put('categories', {
      id: uuidv4(),
      name,
      emoji: newCategoryEmoji,
      isDefault: false,
      displayOrder: maxOrder + 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
    })
    setNewCategoryName('')
    setNewCategoryEmoji('📦')
    await reloadCategories()
  }

  const handleFinish = async () => {
    setLoading(true)
    await setSetting('reminderEnabled', reminderEnabled)
    await setSetting('reminderTime', reminderTime)
    await setSetting('firstLaunchCompleted', true)
    onComplete()
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="flex gap-1 p-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              s <= step ? 'bg-indigo-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Step 1 — Welcome */}
      {step === 1 && (
        <div className="flex flex-col flex-1 items-center justify-center px-6 text-center gap-6">
          <div className="text-6xl">💸</div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Welcome to Expense Tracker
            </h1>
            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
              Log expenses in under 5 seconds. Just type or speak naturally —
              AI does the rest.
            </p>
          </div>
          <div className="w-full space-y-2 text-left bg-gray-50 rounded-xl p-4">
            {[
              ['🎙️', 'Voice ya text input'],
              ['🤖', 'AI auto-categorize karta hai'],
              ['📊', 'Instant spending insights'],
              ['📴', 'Works offline, free forever'],
            ].map(([emoji, text]) => (
              <div key={text} className="flex items-center gap-3 text-sm text-gray-600">
                <span className="text-lg">{emoji}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <button
            onClick={goToStep2}
            className="w-full bg-indigo-500 text-white py-3 rounded-xl font-semibold text-base active:scale-95 transition-transform"
          >
            Get Started →
          </button>
        </div>
      )}

      {/* Step 2 — Categories */}
      {step === 2 && (
        <div className="flex flex-col flex-1 px-6 pt-4 gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Your Categories</h2>
            <p className="text-gray-500 text-sm mt-1">
              These are pre-loaded. You can edit them anytime in Settings.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategoryArchived(cat)}
                  disabled={cat.id === 'cat-other'}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left transition-colors ${
                    cat.archived
                      ? 'bg-gray-100 opacity-45'
                      : 'bg-gray-50 active:bg-indigo-50'
                  }`}
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className={`text-sm font-medium text-gray-700 ${cat.archived ? 'line-through' : ''}`}>
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>

            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Add a category
              </p>
              <div className="flex gap-2">
                <select
                  value={newCategoryEmoji}
                  onChange={(e) => setNewCategoryEmoji(e.target.value)}
                  className="bg-white rounded-xl px-2 text-lg outline-none border border-gray-100"
                  aria-label="Category emoji"
                >
                  {emojiOptions.map((emoji) => (
                    <option key={emoji} value={emoji}>{emoji}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                  placeholder="e.g. Coffee"
                  className="min-w-0 flex-1 bg-white rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none border border-gray-100"
                />
                <button
                  onClick={addCategory}
                  disabled={!newCategoryName.trim()}
                  className="px-3 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Tap any category to hide it. Other stays active as the fallback.
              </p>
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            className="w-full bg-indigo-500 text-white py-3 rounded-xl font-semibold text-base active:scale-95 transition-transform"
          >
            Looks Good →
          </button>
        </div>
      )}

      {/* Step 3 — Reminder */}
      {step === 3 && (
        <div className="flex flex-col flex-1 items-center justify-center px-6 gap-6">
          <div className="text-6xl">🔔</div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800">Daily reminder</h2>
            <p className="text-gray-500 text-sm mt-1">
              Get a nudge to log your expenses each day.
            </p>
          </div>

          <div className="w-full space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-gray-700">Enable reminder</span>
              <button
                onClick={() => setReminderEnabled(!reminderEnabled)}
                className={`w-12 h-6 rounded-full transition-colors duration-200 relative ${
                  reminderEnabled ? 'bg-indigo-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                    reminderEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Time picker */}
            {reminderEnabled && (
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-gray-700">Reminder time</span>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="text-sm font-medium text-indigo-600 bg-transparent outline-none"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleFinish}
            disabled={loading}
            className="w-full bg-indigo-500 text-white py-3 rounded-xl font-semibold text-base active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? 'Setting up...' : "Let's Go! 🚀"}
          </button>
        </div>
      )}
    </div>
  )
}
