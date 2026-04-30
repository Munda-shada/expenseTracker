'use client'

import { useEffect, useState, useCallback } from 'react'
import { getAllTags, renameTag, deleteTag } from '@/lib/db'
import { Tag } from '@/lib/types'

interface Props {
  onBack: () => void
}

export default function TagsScreen({ onBack }: Props) {
  const [tags, setTags] = useState<Tag[]>([])
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const all = await getAllTags()
    // Only show tags with usageCount > 0
    setTags(all.filter((t) => t.usageCount > 0))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleRename = async () => {
    if (!editingTag || !renameValue.trim()) return
    setLoading(true)
    try {
      await renameTag(editingTag.name, renameValue.trim())
      await loadData()
      setEditingTag(null)
      showToast('✅ Tag renamed')
    } catch {
      showToast('❌ Invalid tag name')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (name: string) => {
    setLoading(true)
    await deleteTag(name)
    await loadData()
    setConfirmDelete(null)
    showToast('🗑 Tag deleted from all entries')
    setLoading(false)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-indigo-500 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">Tags</h1>
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-9">
          {tags.length} tags used across your entries
        </p>
      </div>

      <div className="px-4 py-4">
        {tags.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-4xl">🏷️</span>
            <p className="text-sm text-gray-400 text-center">
              No tags yet. Add # tags when logging entries.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {tags.map((tag, i) => (
              <div
                key={tag.name}
                className={i < tags.length - 1 ? 'border-b border-gray-50' : ''}
              >
                {/* Tag row */}
                {confirmDelete !== tag.name && editingTag?.name !== tag.name && (
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-indigo-500">
                        #{tag.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {tag.usageCount} {tag.usageCount === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingTag(tag)
                          setRenameValue(tag.name)
                        }}
                        className="text-xs text-gray-400 font-medium px-2 py-1 rounded-lg bg-gray-50"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => setConfirmDelete(tag.name)}
                        className="text-xs text-red-400 font-medium px-2 py-1 rounded-lg bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {/* Rename inline */}
                {editingTag?.name === tag.name && (
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-xs text-gray-400">
                      Renaming <span className="text-indigo-400">#{tag.name}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center bg-gray-100 rounded-xl px-3 py-2 gap-1">
                        <span className="text-gray-400 text-sm">#</span>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                          autoFocus
                          className="flex-1 bg-transparent text-sm text-gray-800 outline-none"
                        />
                      </div>
                      <button
                        onClick={handleRename}
                        disabled={loading}
                        className="px-3 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-xl disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTag(null)}
                        className="px-3 py-2 bg-gray-100 text-gray-500 text-sm rounded-xl"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Delete confirm */}
                {confirmDelete === tag.name && (
                  <div className="px-4 py-3 space-y-2 bg-red-50">
                    <p className="text-sm text-red-700">
                      Delete <span className="font-semibold">#{tag.name}</span>?
                      This removes it from {tag.usageCount} entries.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 bg-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(tag.name)}
                        disabled={loading}
                        className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-60"
                      >
                        {loading ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
