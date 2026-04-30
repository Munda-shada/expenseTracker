'use client'

import { useEffect, useState } from 'react'
import { clearAllAppData, clearChatHistory, getSetting, setSetting } from '@/lib/db'
import { Settings } from '@/lib/types'

interface Props {
  onBack: () => void
}

export default function PreferencesScreen({ onBack }: Props) {
  const [multiCategoryMode, setMultiCategoryMode] = useState<Settings['multiCategoryMode']>('each')
  const [tagSuggestionsEnabled, setTagSuggestionsEnabled] = useState(true)
  const [bulkEntryAutoDetect, setBulkEntryAutoDetect] = useState(true)
  const [chatMemoryEnabled, setChatMemoryEnabled] = useState(true)
  const [chatIdleTimeoutMinutes, setChatIdleTimeoutMinutes] = useState(10)
  const [lastChatClearedAt, setLastChatClearedAt] = useState<number | null>(null)
  const [quickAddAutoDetect, setQuickAddAutoDetect] = useState(true)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadSettings = async () => {
    const [mode, tags, bulk, chat, timeout, lastCleared, quickAdd] = await Promise.all([
      getSetting('multiCategoryMode'),
      getSetting('tagSuggestionsEnabled'),
      getSetting('bulkEntryAutoDetect'),
      getSetting('chatMemoryEnabled'),
      getSetting('chatIdleTimeoutMinutes'),
      getSetting('lastChatClearedAt'),
      getSetting('quickAddAutoDetect'),
    ])
    setMultiCategoryMode(mode ?? 'each')
    setTagSuggestionsEnabled(tags ?? true)
    setBulkEntryAutoDetect(bulk ?? true)
    setChatMemoryEnabled(chat ?? true)
    setChatIdleTimeoutMinutes(timeout ?? 10)
    setLastChatClearedAt(lastCleared && lastCleared > 0 ? lastCleared : null)
    setQuickAddAutoDetect(quickAdd ?? true)
  }

  useEffect(() => {
    loadSettings()
  }, [])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2500)
  }

  const updateSetting = async <K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ) => {
    await setSetting(key, value)
  }

  const clearChat = async () => {
    await clearChatHistory()
    const now = Date.now()
    await setSetting('lastChatClearedAt', now)
    setLastChatClearedAt(now)
    showToast('Chat history cleared')
  }

  const clearAll = async () => {
    await clearAllAppData()
    window.location.reload()
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-indigo-500 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Preferences</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Multi-category mode</p>
          <div className="grid grid-cols-2 gap-2 bg-gray-100 rounded-xl p-1">
            {(['each', 'split'] as const).map((mode) => (
              <button
                key={mode}
                onClick={async () => {
                  setMultiCategoryMode(mode)
                  await updateSetting('multiCategoryMode', mode)
                }}
                className={`py-2 rounded-lg text-sm font-semibold ${
                  multiCategoryMode === mode
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-400'
                }`}
              >
                {mode === 'each' ? 'Each' : 'Split'}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Each counts the full amount in every selected category. Split divides it evenly.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <ToggleRow
            label="Tag suggestions"
            enabled={tagSuggestionsEnabled}
            onToggle={async () => {
              const next = !tagSuggestionsEnabled
              setTagSuggestionsEnabled(next)
              await updateSetting('tagSuggestionsEnabled', next)
            }}
          />
          <ToggleRow
            label="Bulk auto-detect"
            enabled={bulkEntryAutoDetect}
            onToggle={async () => {
              const next = !bulkEntryAutoDetect
              setBulkEntryAutoDetect(next)
              await updateSetting('bulkEntryAutoDetect', next)
            }}
          />
          <ToggleRow
            label="Chat memory"
            enabled={chatMemoryEnabled}
            onToggle={async () => {
              const next = !chatMemoryEnabled
              setChatMemoryEnabled(next)
              await updateSetting('chatMemoryEnabled', next)
            }}
          />
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs text-gray-400">
              Clears after {chatIdleTimeoutMinutes} minutes idle, when switching to Log, or when the app closes.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {lastChatClearedAt
                ? `Last cleared ${new Date(lastChatClearedAt).toLocaleString('en-IN')}`
                : 'No clear recorded yet'}
            </p>
          </div>
          <ToggleRow
            label="Quick Action auto-detect"
            enabled={quickAddAutoDetect}
            onToggle={async () => {
              const next = !quickAddAutoDetect
              setQuickAddAutoDetect(next)
              await updateSetting('quickAddAutoDetect', next)
            }}
            last
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <button
            onClick={clearChat}
            className="w-full flex items-center justify-between px-4 py-4 border-b border-gray-50"
          >
            <span className="text-sm font-semibold text-gray-700">Clear chat history</span>
            <span className="text-xs text-indigo-500">Clear</span>
          </button>
          {confirmClearAll ? (
            <div className="px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-red-500">Clear all local data?</p>
              <p className="text-xs text-gray-400">
                This removes entries, categories, tags, budgets, settings, pending logs, and history.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={clearAll}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold"
                >
                  Clear All
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="w-full flex items-center justify-between px-4 py-4"
            >
              <span className="text-sm font-semibold text-red-500">Clear all data</span>
              <span className="text-xs text-red-400">Reset</span>
            </button>
          )}
        </div>
      </div>

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

function ToggleRow({
  label,
  enabled,
  onToggle,
  last = false,
}: {
  label: string
  enabled: boolean
  onToggle: () => void
  last?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-4 py-4 ${!last ? 'border-b border-gray-50' : ''}`}
    >
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <span className={`w-12 h-7 rounded-full p-0.5 transition-colors ${enabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
        <span className={`block w-6 h-6 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}
