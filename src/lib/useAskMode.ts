import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { ChatMessage, QuickQuestion, QuickQuestionFilter } from './types'
import { addChatMessage, getChatHistory, clearChatHistory, getCategories, getSetting, setSetting } from './db'
import { runQuery, QueryFilter } from './queryEngine'
import { formatLocalDateString, getTodayString } from './utils'

export type AskStatus =
  | 'idle'
  | 'classifying'
  | 'translating'
  | 'querying'
  | 'formatting'
  | 'error'

export interface AskResult {
  displayMode: 'inline' | 'navigate'
  filters?: object
}

function toDateString(date: Date): string {
  return formatLocalDateString(date)
}

function getRelativeDateRange(text: string): Pick<QuickQuestionFilter, 'dateFrom' | 'dateTo'> | null {
  const value = text.toLowerCase()
  const now = new Date()
  const today = getTodayString()

  if (/\b(yesterday|kal)\b/.test(value)) {
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const date = toDateString(yesterday)
    return { dateFrom: date, dateTo: date }
  }

  if (/\b(today|aaj)\b/.test(value)) {
    return { dateFrom: today, dateTo: today }
  }

  if (/\b(last month|pichle mahine)\b/.test(value)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { dateFrom: toDateString(start), dateTo: toDateString(end) }
  }

  if (/\b(this month|is mahine)\b/.test(value)) {
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return { dateFrom: start, dateTo: today }
  }

  if (/\b(last week|pichle hafte)\b/.test(value)) {
    const start = new Date(now)
    start.setDate(now.getDate() - 14)
    const end = new Date(now)
    end.setDate(now.getDate() - 7)
    return { dateFrom: toDateString(start), dateTo: toDateString(end) }
  }

  if (/\b(this week|week|hafte)\b/.test(value)) {
    const start = new Date(now)
    start.setDate(now.getDate() - 7)
    return { dateFrom: toDateString(start), dateTo: today }
  }

  return null
}

function resolveQuickQuestionFilters(question: QuickQuestion): QuickQuestionFilter {
  const relativeRange = getRelativeDateRange(`${question.question} ${question.naturalContext}`)
  return relativeRange ? { ...question.filters, ...relativeRange } : question.filters
}

export function useAskMode() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<AskStatus>('idle')
  const [disambiguation, setDisambiguation] = useState<{
    input: string
    resolve: (choice: 'log' | 'query') => void
  } | null>(null)
  const lastActivityRef = useRef<number | null>(null)

  const loadHistory = useCallback(async () => {
    const memoryEnabled = await getSetting('chatMemoryEnabled')
    if (memoryEnabled === false) {
      setMessages([])
      return
    }
    const history = await getChatHistory(10)
    lastActivityRef.current = Date.now()
    setMessages(history)
  }, [])

  const clearHistory = useCallback(async () => {
    await clearChatHistory()
    await setSetting('lastChatClearedAt', Date.now())
    setMessages([])
  }, [])

  const addMessage = useCallback(
    async (msg: ChatMessage) => {
      lastActivityRef.current = Date.now()
      const memoryEnabled = await getSetting('chatMemoryEnabled')
      if (memoryEnabled !== false) {
        await addChatMessage(msg)
      }
      setMessages((prev) => [...prev, msg])
    },
    []
  )

  const ask = useCallback(
    async (
      input: string
    ): Promise<AskResult | null> => {
      if (!input.trim()) return null
      lastActivityRef.current = Date.now()

      const memoryEnabled = await getSetting('chatMemoryEnabled')
      const history = memoryEnabled === false ? [] : await getChatHistory(10)
      const categories = await getCategories()

      // Add user message
      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        message: input,
        intent: null,
        parsedQuery: null,
        result: null,
        displayMode: null,
        createdAt: Date.now(),
      }
      await addMessage(userMsg)

      try {
        // ── Step 1: Intent classify ──────────────────────
        setStatus('classifying')
        const intentRes = await fetch('/api/ask-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: input,
            chatHistory: history.map((m) => ({
              role: m.role,
              message: m.message,
            })),
          }),
        })
        const { intent } = await intentRes.json()

        // ── Step 2: Handle unclear via disambiguation ────
        let resolvedIntent = intent
        if (intent === 'unclear') {
          resolvedIntent = await new Promise<'log' | 'query'>((resolve) => {
            setDisambiguation({ input, resolve })
          })
          setDisambiguation(null)
        }

        // ── Step 3: If log intent, return null ───────────
        if (resolvedIntent === 'log') {
          // Remove the user message we just added — let Log Mode handle it
          await clearChatHistory()
          setMessages([])
          return null
        }

        // ── Step 4: Translate query ──────────────────────
        setStatus('translating')
        const translateRes = await fetch('/api/ask-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: input,
            today: getTodayString(),
            categories: categories.map((c) => ({ id: c.id, name: c.name })),
            chatHistory: history.map((m) => ({
              role: m.role,
              message: m.message,
            })),
          }),
        })

        if (!translateRes.ok) throw new Error('Translation failed')
        const translated = await translateRes.json()

        const {
          operation,
          filters,
          displayMode,
          naturalContext,
        } = translated

        // ── Step 5: Run query (code only, no AI math) ────
        setStatus('querying')
        const queryResult = await runQuery(
          operation,
          filters as QueryFilter
        )

        // ── Step 6: Format result ────────────────────────
        setStatus('formatting')
        const formatRes = await fetch('/api/ask-format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: input,
            result: queryResult,
            naturalContext,
            chatHistory: history.map((m) => ({
              role: m.role,
              message: m.message,
            })),
          }),
        })

        if (!formatRes.ok) throw new Error('Formatting failed')
        const { message: formattedMessage } = await formatRes.json()

        // ── Step 7: Add assistant message ────────────────
        const assistantMsg: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          message: formattedMessage,
          intent: null,
          parsedQuery: displayMode === 'inline' ? filters : null,
          result: queryResult,
          displayMode,
          createdAt: Date.now(),
        }
        await addMessage(assistantMsg)

        setStatus('idle')

        return {
          displayMode,
          filters: displayMode === 'navigate' ? filters : undefined,
        }
      } catch (e) {
        console.error('Ask Mode error:', e)
        setStatus('error')

        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          message: "Sorry, I couldn't process that. Please try again.",
          intent: null,
          parsedQuery: null,
          result: null,
          displayMode: 'inline',
          createdAt: Date.now(),
        }
        await addMessage(errMsg)
        setStatus('idle')
        return null
      }
    },
    [addMessage]
  )

  const askQuickQuestion = useCallback(
    async (question: QuickQuestion): Promise<AskResult | null> => {
      lastActivityRef.current = Date.now()
      const memoryEnabled = await getSetting('chatMemoryEnabled')
      const history = memoryEnabled === false ? [] : await getChatHistory(10)
      const filters = resolveQuickQuestionFilters(question)

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        message: question.question,
        intent: null,
        parsedQuery: null,
        result: null,
        displayMode: null,
        createdAt: Date.now(),
      }
      await addMessage(userMsg)

      try {
        setStatus('querying')
        const queryResult = await runQuery(question.operation, filters as QueryFilter)

        setStatus('formatting')
        const formatRes = await fetch('/api/ask-format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question.question,
            result: queryResult,
            naturalContext: question.naturalContext,
            chatHistory: history.map((m) => ({
              role: m.role,
              message: m.message,
            })),
          }),
        })

        if (!formatRes.ok) throw new Error('Formatting failed')
        const { message: formattedMessage } = await formatRes.json()

        const assistantMsg: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          message: formattedMessage,
          intent: null,
          parsedQuery: question.displayMode === 'inline' ? filters : null,
          result: queryResult,
          displayMode: question.displayMode,
          createdAt: Date.now(),
        }
        await addMessage(assistantMsg)
        setStatus('idle')

        return {
          displayMode: question.displayMode,
          filters: question.displayMode === 'navigate' ? filters : undefined,
        }
      } catch (e) {
        console.error('Quick Question error:', e)
        setStatus('error')
        const errMsg: ChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          message: "Sorry, I couldn't process that. Please try again.",
          intent: null,
          parsedQuery: null,
          result: null,
          displayMode: 'inline',
          createdAt: Date.now(),
        }
        await addMessage(errMsg)
        setStatus('idle')
        return null
      }
    },
    [addMessage]
  )

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const memoryEnabled = await getSetting('chatMemoryEnabled')
      if (memoryEnabled === false) return
      const timeout = await getSetting('chatIdleTimeoutMinutes')
      const timeoutMs = (timeout ?? 10) * 60 * 1000
      const lastActivity = lastActivityRef.current ?? Date.now()
      if (messages.length > 0 && Date.now() - lastActivity >= timeoutMs) {
        await clearHistory()
      }
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [messages.length, clearHistory])

  useEffect(() => {
    const handleBeforeUnload = () => {
      clearChatHistory()
      setSetting('lastChatClearedAt', Date.now())
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return {
    messages,
    status,
    disambiguation,
    loadHistory,
    clearHistory,
    ask,
    askQuickQuestion,
  }
}
