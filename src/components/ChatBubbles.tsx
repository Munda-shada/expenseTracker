'use client'

import { useEffect, useRef } from 'react'
import { ChatMessage, QuickQuestion } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface Props {
  messages: ChatMessage[]
  quickQuestions: QuickQuestion[]
  onQuickQuestion: (question: QuickQuestion) => void
  onViewDetails: (filters: object) => void
}

export default function ChatBubbles({
  messages,
  quickQuestions,
  onQuickQuestion,
  onViewDetails,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="px-4 py-5">
        <div className="rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-900">Ask your money</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
            Try natural questions like “food spend this month”, “biggest expense this week”, or “am I over budget?”
          </p>
        </div>
        <p className="mt-4 text-center text-sm font-semibold text-slate-700">Quick questions</p>
        <div className="flex w-full flex-wrap justify-center gap-2">
          {quickQuestions.map((question) => (
            <button
              key={question.id}
              onClick={() => onQuickQuestion(question)}
              className="max-w-full rounded-full border border-indigo-100 bg-white px-3 py-2 text-xs font-semibold text-indigo-600 shadow-sm active:scale-95"
            >
              {question.question}
            </button>
          ))}
        </div>
        {quickQuestions.length === 0 && (
          <p className="text-center text-sm text-gray-400">
            Add quick questions in Settings to speed up Ask Mode.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-indigo-500 text-white rounded-br-sm'
                : 'bg-white shadow-sm text-gray-800 rounded-bl-sm'
            }`}
          >
            <p className="text-sm leading-relaxed">{msg.message}</p>

            {msg.role === 'assistant' && <BudgetResult result={msg.result} />}

            {/* View details link for assistant messages */}
            {msg.role === 'assistant' &&
              msg.displayMode === 'inline' &&
              msg.parsedQuery && (
                <button
                  onClick={() => onViewDetails(msg.parsedQuery!)}
                  className="text-xs text-indigo-400 font-medium mt-1.5 block"
                >
                  View details →
                </button>
              )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function BudgetResult({ result }: { result: object | null }) {
  if (!result || typeof result !== 'object') return null
  const data = result as {
    operation?: string
    budgetLimit?: number
    budgetUsed?: number
    budgetPercent?: number
  }
  if (data.operation !== 'budget_check' || !data.budgetLimit) return null

  const percent = Math.min(data.budgetPercent ?? 0, 100)
  const color =
    percent >= 100
      ? 'bg-red-500'
      : percent >= 80
      ? 'bg-yellow-500'
      : 'bg-indigo-500'

  return (
    <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="font-semibold text-gray-600">Budget</span>
        <span className="text-gray-500">
          {formatCurrency(data.budgetUsed ?? 0)} / {formatCurrency(data.budgetLimit)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{data.budgetPercent ?? 0}% used</p>
    </div>
  )
}
