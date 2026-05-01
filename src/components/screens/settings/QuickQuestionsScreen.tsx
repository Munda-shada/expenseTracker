'use client'

import { useEffect, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ChevronDown, ChevronLeft, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import {
  deleteQuickQuestion,
  getCategories,
  getQuickQuestions,
  reorderQuickQuestions,
  saveQuickQuestion,
} from '@/lib/db'
import { Category, QuickQuestion, QuickQuestionFilter, QuickQuestionOperation } from '@/lib/types'

interface Props {
  onBack: () => void
}

type QuestionDraft = QuickQuestion | null

const emptyFilters = {
  type: 'expense' as const,
  categoryIds: null,
  paymentMethods: null,
  tags: null,
  dateFrom: null,
  dateTo: null,
  search: null,
}

export default function QuickQuestionsScreen({ onBack }: Props) {
  const [questions, setQuestions] = useState<QuickQuestion[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [editing, setEditing] = useState<QuestionDraft>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [items, cats] = await Promise.all([
      getQuickQuestions(),
      getCategories(),
    ])
    setQuestions(items)
    setCategories(cats.filter((category) => !category.archived))
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2500)
  }

  const moveQuestion = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= questions.length) return
    const next = [...questions]
    const current = next[index]
    next[index] = next[nextIndex]
    next[nextIndex] = current
    setQuestions(next.map((question, order) => ({ ...question, displayOrder: order + 1 })))
    await reorderQuickQuestions(next)
    await loadData()
  }

  const toggleQuestion = async (question: QuickQuestion) => {
    await saveQuickQuestion({ ...question, enabled: !question.enabled })
    await loadData()
  }

  const removeQuestion = async (id: string) => {
    await deleteQuickQuestion(id)
    await loadData()
    showToast('Quick question removed')
  }

  const openAdd = () => {
    const now = Date.now()
    setEditing({
      id: uuidv4(),
      question: '',
      operation: 'sum',
      filters: emptyFilters,
      displayMode: 'inline',
      naturalContext: '',
      enabled: true,
      displayOrder: questions.length + 1,
      createdAt: now,
      updatedAt: now,
    })
    setIsAdding(true)
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1 text-indigo-500" aria-label="Back">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Quick Questions</h1>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="rounded-2xl bg-indigo-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-indigo-600">
            Saved questions skip AI translation. Answers still refresh from your current expenses when tapped.
          </p>
        </div>

        {questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <p className="text-sm text-gray-400">No quick questions yet.</p>
            <button
              onClick={openAdd}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Add question
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {questions.map((question, index) => (
              <div
                key={question.id}
                className={`px-4 py-3.5 ${index < questions.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => {
                      setEditing(question)
                      setIsAdding(false)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-gray-800">{question.question}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {question.operation} · {question.displayMode} · {question.enabled ? 'enabled' : 'disabled'}
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => moveQuestion(index, -1)}
                      disabled={index === 0}
                      className="rounded-lg bg-gray-50 p-1.5 text-gray-400 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveQuestion(index, 1)}
                      disabled={index === questions.length - 1}
                      className="rounded-lg bg-gray-50 p-1.5 text-gray-400 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleQuestion(question)}
                      className={`h-7 w-12 rounded-full p-0.5 transition-colors ${
                        question.enabled ? 'bg-indigo-500' : 'bg-gray-300'
                      }`}
                      aria-label="Toggle quick question"
                    >
                      <span
                        className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                          question.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => removeQuestion(question.id)}
                      className="rounded-lg bg-red-50 p-1.5 text-red-400"
                      aria-label="Delete quick question"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <QuickQuestionModal
          draft={editing}
          categories={categories}
          isAdding={isAdding}
          onCancel={() => setEditing(null)}
          onSave={async (question) => {
            await saveQuickQuestion(question)
            await loadData()
            setEditing(null)
            showToast(isAdding ? 'Quick question added' : 'Quick question updated')
          }}
          onError={() => showToast('Could not prepare this question. Try rewording it.')}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

function QuickQuestionModal({
  draft,
  categories,
  isAdding,
  onSave,
  onCancel,
  onError,
}: {
  draft: QuickQuestion
  categories: Category[]
  isAdding: boolean
  onSave: (question: QuickQuestion) => void
  onCancel: () => void
  onError: () => void
}) {
  const [question, setQuestion] = useState(draft.question)
  const [enabled, setEnabled] = useState(draft.enabled)
  const [saving, setSaving] = useState(false)
  const canSave = Boolean(question.trim()) && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await fetch('/api/ask-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question.trim(),
          categories: categories.map((category) => ({
            id: category.id,
            name: category.name,
          })),
          chatHistory: [],
        }),
      })
      if (!res.ok) throw new Error('Translate failed')
      const translated = await res.json()
      const operation = translated.operation as QuickQuestionOperation
      if (!operation || !translated.filters || !translated.displayMode) {
        throw new Error('Invalid translation')
      }

      onSave({
        ...draft,
        question: question.trim(),
        operation,
        filters: translated.filters as QuickQuestionFilter,
        displayMode: translated.displayMode as QuickQuestion['displayMode'],
        naturalContext: translated.naturalContext || question.trim(),
        enabled,
      })
    } catch (error) {
      console.error(error)
      onError()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40" onClick={onCancel}>
      <div
        className="max-h-[90vh] w-full max-w-120 overflow-y-auto rounded-t-2xl bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4">
          <button onClick={onCancel} className="text-gray-400" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <p className="font-semibold text-gray-800">{isAdding ? 'Add Question' : 'Edit Question'}</p>
          <div className="w-5" />
        </div>

        <div className="space-y-4 px-4 py-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Question</span>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="e.g. How much on food this month?"
              autoFocus
              className="mt-2 w-full rounded-xl bg-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none"
            />
          </label>

          <button
            onClick={() => setEnabled((value) => !value)}
            className="flex w-full items-center justify-between rounded-2xl bg-gray-50 px-4 py-3"
          >
            <span className="text-sm font-semibold text-gray-700">Enabled</span>
            <span className={`h-7 w-12 rounded-full p-0.5 transition-colors ${enabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
              <span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
          </button>
        </div>

        <div className="px-4 pb-6">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Preparing...' : 'Save Question'}
          </button>
        </div>
      </div>
    </div>
  )
}
