'use client'

import { useState, useEffect, useRef } from 'react'
import { getTagSuggestions } from '@/lib/db'
import { Tag } from '@/lib/types'
import { normalizeTag } from '@/lib/tagUtils'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestedTags?: string[] // from AI
}

export default function TagInput({ tags, onChange, suggestedTags = [] }: Props) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load suggestions when input changes
  useEffect(() => {
    if (input.length === 0) {
      getTagSuggestions('', 8).then(setSuggestions)
    } else {
      getTagSuggestions(input, 8).then(setSuggestions)
    }
  }, [input])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addTag = (raw: string) => {
    const normalized = normalizeTag(raw)
    if (!normalized) return
    if (!tags.includes(normalized)) {
      onChange([...tags, normalized])
    }
    setInput('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  // AI suggested tags not yet added
  const pendingSuggestions = suggestedTags.filter((t) => !tags.includes(t))

  return (
    <div ref={containerRef} className="space-y-2">

      {/* AI suggestions */}
      {pendingSuggestions.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400">Suggested:</span>
          {pendingSuggestions.map((tag) => (
            <button
              key={tag}
              onClick={() => addTag(tag)}
              className="text-xs bg-indigo-50 text-indigo-500 border border-indigo-200 border-dashed px-2 py-0.5 rounded-full"
            >
              + #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Current tags */}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 bg-indigo-50 text-indigo-500 text-xs px-2.5 py-1 rounded-full"
            aria-label={`Tag ${tag}, tap to remove`}
          >
            #{tag}
            <button
              onClick={() => removeTag(tag)}
              className="text-indigo-300 hover:text-indigo-500 ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {/* Input */}
      <div className="relative">
        <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2 gap-2">
          <span className="text-gray-400 text-sm">#</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value.replace(/\s/g, '-'))
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (input.trim()) addTag(input)
              }
              if (e.key === 'Backspace' && !input && tags.length > 0) {
                removeTag(tags[tags.length - 1])
              }
            }}
            placeholder="Add tag..."
            className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
          />
          {input.length > 0 && (
            <button
              onClick={() => addTag(input)}
              className="text-xs text-indigo-500 font-medium shrink-0"
            >
              Add
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
            {suggestions
              .filter((s) => !tags.includes(s.name))
              .slice(0, 6)
              .map((s) => (
                <button
                  key={s.name}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    addTag(s.name)
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm text-indigo-500">#{s.name}</span>
                  <span className="text-xs text-gray-300">{s.usageCount}×</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
