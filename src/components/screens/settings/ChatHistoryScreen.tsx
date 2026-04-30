'use client'

import { useEffect, useState } from 'react'
import { clearChatHistory, getChatHistory, getSetting, setSetting } from '@/lib/db'
import { ChatMessage } from '@/lib/types'

interface Props {
  onBack: () => void
}

export default function ChatHistoryScreen({ onBack }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [idleMinutes, setIdleMinutes] = useState(10)
  const [toast, setToast] = useState<string | null>(null)

  const loadData = async () => {
    const [history, enabled, timeout] = await Promise.all([
      getChatHistory(10),
      getSetting('chatMemoryEnabled'),
      getSetting('chatIdleTimeoutMinutes'),
    ])
    setMessages(history)
    setMemoryEnabled(enabled !== false)
    setIdleMinutes(timeout ?? 10)
  }

  useEffect(() => {
    loadData()
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleClear = async () => {
    await clearChatHistory()
    await setSetting('lastChatClearedAt', Date.now())
    await loadData()
    showToast('Chat history cleared')
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
          <h1 className="text-xl font-bold text-gray-800">Chat history</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-indigo-50 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-indigo-600 mb-1">
            {memoryEnabled ? 'Memory is on' : 'Memory is off'}
          </p>
          <p className="text-xs text-indigo-500 leading-relaxed">
            Chat clears after {idleMinutes} minutes idle, when switching to Log, or when the app closes.
          </p>
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-4xl">💬</span>
            <p className="text-sm text-gray-400 text-center">
              {memoryEnabled ? 'No chat history right now.' : 'Chat memory is disabled.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`px-4 py-3 ${index < messages.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.message}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleClear}
          className="w-full py-3 rounded-xl bg-red-50 text-red-500 text-sm font-semibold"
        >
          Clear chat history
        </button>
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
