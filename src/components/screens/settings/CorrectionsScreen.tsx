'use client'

import { useEffect, useState, useCallback } from 'react'
import { getDB } from '@/lib/db'
import { Correction } from '@/lib/types'

interface Props {
  onBack: () => void
}

export default function CorrectionsScreen({ onBack }: Props) {
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [confirmClear, setConfirmClear] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const db = await getDB()
    const all = await db.getAllFromIndex('corrections', 'by-createdAt')
    setCorrections(all.reverse())
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleClear = async () => {
    setLoading(true)
    const db = await getDB()
    const all = await db.getAll('corrections')
    for (const c of all) {
      await db.delete('corrections', c.id)
    }
    await loadData()
    setConfirmClear(false)
    setLoading(false)
    showToast('🧹 Corrections cleared')
  }

  const formatField = (field: string, value: unknown): string => {
    if (Array.isArray(value)) return value.join(', ')
    return String(value)
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
            <h1 className="text-xl font-bold text-gray-800">AI corrections</h1>
          </div>
          {corrections.length > 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-xs text-red-400 font-medium px-3 py-1.5 rounded-xl bg-red-50"
            >
              Clear All
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-9">
          {corrections.length} corrections · injected into every AI parse
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">

        {/* How it works */}
        <div className="bg-indigo-50 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-indigo-600 mb-1">How this works</p>
          <p className="text-xs text-indigo-500 leading-relaxed">
            Every time you edit a field in the Confirm modal, that correction is saved here.
            The last 10 corrections are injected into every AI parse request so the AI learns
            your preferences over time.
          </p>
        </div>

        {/* Confirm clear */}
        {confirmClear && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 space-y-3">
            <p className="text-sm text-red-700 font-medium">
              Clear all {corrections.length} corrections? The AI will start fresh.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
              >
                {loading ? 'Clearing...' : 'Yes, Clear'}
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {corrections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-4xl">🧠</span>
            <p className="text-sm text-gray-400 text-center">
              No corrections yet.{'\n'}Edit a field in the Confirm modal and it appears here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {corrections.map((correction) => {
              const aiOutput = correction.aiOutput as Record<string, unknown>
              const userCorrected = correction.userCorrected as Record<string, unknown>

              return (
                <div
                  key={correction.id}
                  className="bg-white rounded-2xl shadow-sm px-4 py-3 space-y-2"
                >
                  {/* Original input input */}
                  <p className="text-xs text-gray-400 italic">
                    "{correction.rawInput}"
                  </p>

                  {/* Changed fields */}
                  <div className="space-y-1">
                    {correction.correctedFields.map((field) => (
                      <div key={field} className="flex items-start gap-2">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase w-20 shrink-0 pt-0.5">
                          {field}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded line-through">
                            {formatField(field, aiOutput[field])}
                          </span>
                          <span className="text-gray-300 text-xs">→</span>
                          <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-medium">
                            {formatField(field, userCorrected[field])}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Timestamp */}
                  <p className="text-[10px] text-gray-300">
                    {new Date(correction.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

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
