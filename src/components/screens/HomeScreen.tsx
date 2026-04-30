'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Check,
  CircleDollarSign,
  Mic,
  Plus,
  Search,
  Send,
  Sparkles,
  TrendingDown,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  getEntriesByDate,
  getEntriesInRange,
  getRecentEntries,
  getCategories,
  getRecentCorrections,
  getBudgetByCategoryId,
  getBudgets,
  addPendingLog,
  getPendingEntries,
  deletePendingLog,
  deleteEntry,
  getSetting,
  getQuickQuestions,
  getDueRecurringRules,
  advanceRecurringRule,
  updatePendingLogStatus,
} from '@/lib/db'
import { Entry, Category, EntrySource, RecurringRule, QuickQuestion } from '@/lib/types'
import {
  getTodayString,
  getYesterdayString,
  getMonthStartString,
  formatCurrency,
  formatDisplayDate,
  timeAgo,
} from '@/lib/utils'
import ConfirmEntryModal from '@/components/ConfirmEntryModal'
import BulkConfirmModal from '@/components/BulkConfirmModal'
import EntryDetailModal from '@/components/EntryDetailModal'
import EditEntryModal from '@/components/EditEntryModal'
import QuickAddTileRow from '@/components/QuickAddTileRow'
import ChatBubbles from '@/components/ChatBubbles'
import DisambiguationModal from '@/components/DisambiguationModal'
import ManualEntryModal from '@/components/ManualEntryModal'
import { useAskMode } from '@/lib/useAskMode'
import { parseLocalEntry } from '@/lib/localParser'
import { inferEntryTags, refineCategoryIdsForInput } from '@/lib/tagUtils'
import { HINGLISH_QUERY_STARTERS, includesAnyWord } from '@/lib/hinglish'
import { buildSpendingInsights, getPreviousMonthRangeForInsights, SpendingInsight } from '@/lib/insightsEngine'
import { canRetryPendingLog, getPendingLogStatus, getPendingLogStatusLabel } from '@/lib/offlineRetry'

type Mode = 'log' | 'ask'

interface ToastState {
  message: string
  undo?: () => void
}

function MetricTile({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${
      strong ? 'border-indigo-100 bg-indigo-50' : 'border-slate-100 bg-slate-50'
    }`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${
          strong ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'
        }`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className={`truncate text-lg font-black ${strong ? 'text-indigo-800' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  )
}

interface ParsedEntry {
  type: 'expense' | 'income'
  amount: number
  categoryIds: string[]
  date: string
  note: string
  tags: string[]
  confidence: 'high' | 'medium' | 'low'
}

const DEVANAGARI_RE = /[\u0900-\u097F]/
const DEVANAGARI_CHARS_RE = /[\u0900-\u097F]/g

const DEVANAGARI_HINGLISH_REPLACEMENTS: Array<[RegExp, string]> = [
  [/चाय/g, 'chai'],
  [/पे/g, 'pe'],
  [/पर/g, 'par'],
  [/में/g, 'mein'],
  [/मे/g, 'me'],
  [/का/g, 'ka'],
  [/के लिए/g, 'ke liye'],
  [/लिए/g, 'liye'],
  [/खर्चा?/g, 'kharch'],
  [/दिया/g, 'diya'],
  [/लिया/g, 'liya'],
  [/आज/g, 'aaj'],
  [/कल/g, 'kal'],
  [/पेट्रोल/g, 'petrol'],
  [/ऑटो/g, 'auto'],
  [/कैब/g, 'cab'],
  [/दवाई/g, 'dawai'],
  [/दवा/g, 'dawa'],
  [/डॉक्टर/g, 'doctor'],
  [/बिजली/g, 'bijli'],
  [/किराना/g, 'kirana'],
  [/सब्जी/g, 'sabzi'],
  [/नाश्ता/g, 'nashta'],
  [/खाना/g, 'khana'],
  [/मोबाइल रिचार्ज/g, 'mobile recharge'],
  [/सैलरी आई/g, 'salary aayi'],
  [/सैलरी आया/g, 'salary aya'],
  [/पैसे मिले/g, 'paise mile'],
  [/कितना/g, 'kitna'],
  [/कितने/g, 'kitne'],
  [/दिखाओ/g, 'dikhao'],
  [/बताओ/g, 'batao'],
  [/गया/g, 'gaya'],
  [/हुआ/g, 'hua'],
  [/महीने/g, 'mahine'],
]

function toRomanMicTranscript(transcript: string) {
  let value = transcript.trim()
  for (const [pattern, replacement] of DEVANAGARI_HINGLISH_REPLACEMENTS) {
    value = value.replace(pattern, replacement)
  }
  return value
    .replace(DEVANAGARI_CHARS_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function chooseRomanMicTranscript(alternatives: SpeechRecognitionAlternative[]) {
  const sorted = [...alternatives]
    .map((item) => ({ text: item.transcript.trim(), confidence: item.confidence || 0 }))
    .filter((item) => item.text)
    .sort((a, b) => {
      const aRoman = DEVANAGARI_RE.test(a.text) ? 0 : 1
      const bRoman = DEVANAGARI_RE.test(b.text) ? 0 : 1
      if (aRoman !== bRoman) return bRoman - aRoman
      return b.confidence - a.confidence
    })

  const best = sorted[0]?.text
  if (!best) return ''
  return DEVANAGARI_RE.test(best) ? toRomanMicTranscript(best) : best
}

interface Props {
  onViewAll: () => void
  onNavigateToHistory: (filters: object) => void
  focusLogInput?: boolean
  onLogInputFocused?: () => void
}

export default function HomeScreen({
  onViewAll,
  onNavigateToHistory,
  focusLogInput = false,
  onLogInputFocused,
}: Props) {
  const [mode, setMode] = useState<Mode>('log')
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [todaySpend, setTodaySpend] = useState(0)
  const [monthSpend, setMonthSpend] = useState(0)
  const [monthBudget, setMonthBudget] = useState<number | null>(null)
  const [recentEntries, setRecentEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [localInsights, setLocalInsights] = useState<SpendingInsight[]>([])
  const [pendingParsed, setPendingParsed] = useState<ParsedEntry | null>(null)
  const [pendingParsedSource, setPendingParsedSource] = useState<EntrySource>('ai')
  const [pendingBulk, setPendingBulk] = useState<ParsedEntry[] | null>(null)
  const [pendingRawInput, setPendingRawInput] = useState('')
  const [pendingRetryId, setPendingRetryId] = useState<string | null>(null)
  const [pendingRecurringRule, setPendingRecurringRule] = useState<RecurringRule | null>(null)
  const [pendingLogs, setPendingLogs] = useState<Entry[]>([])
  const [quickQuestions, setQuickQuestions] = useState<QuickQuestion[]>([])
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [manualEntryRawInput, setManualEntryRawInput] = useState<string | null>(null)
  const [logGuardInput, setLogGuardInput] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  const micEndedWithErrorRef = useRef(false)
  const micStoppedManuallyRef = useRef(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoRetryIdRef = useRef<string | null>(null)

  // Ask Mode
  const {
    messages: chatMessages,
    status: askStatus,
    disambiguation,
    loadHistory,
    clearHistory,
    ask,
    askQuickQuestion,
  } = useAskMode()

  const loadData = useCallback(async () => {
    const today = getTodayString()
    const monthStart = getMonthStartString()
    const previousRange = getPreviousMonthRangeForInsights()
    const [
      todayEntries,
      monthEntries,
      previousMonthEntries,
      recent,
      cats,
      budget,
      allBudgets,
      multiCategoryMode,
      pending,
      questions,
    ] = await Promise.all([
      getEntriesByDate(today),
      getEntriesInRange(monthStart, today),
      getEntriesInRange(previousRange.start, previousRange.end),
      getRecentEntries(5),
      getCategories(),
      getBudgetByCategoryId('overall'),
      getBudgets(),
      getSetting('multiCategoryMode'),
      getPendingEntries(),
      getQuickQuestions({ enabledOnly: true }),
    ])
    const todayTotal = todayEntries
      .filter((e) => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0)
    const monthTotal = monthEntries
      .filter((e) => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0)
    setTodaySpend(todayTotal)
    setMonthSpend(monthTotal)
    setMonthBudget(budget?.monthlyLimit ?? null)
    setRecentEntries(recent)
    setCategories(cats)
    setPendingLogs(pending)
    setQuickQuestions(questions)
    setLocalInsights(buildSpendingInsights({
      entries: monthEntries,
      previousEntries: previousMonthEntries,
      categories: cats,
      budgets: allBudgets,
      multiCategoryMode: multiCategoryMode ?? 'each',
    }))
  }, [])

  useEffect(() => {
    loadData()
    loadHistory()
  }, [loadData, loadHistory])

  // Clear chat when switching to Log mode
  useEffect(() => {
    if (mode === 'log') clearHistory()
  }, [mode, clearHistory])

  useEffect(() => {
    if (!focusLogInput) return
    window.setTimeout(() => {
      setMode('log')
      inputRef.current?.focus()
      onLogInputFocused?.()
    }, 0)
  }, [focusLogInput, onLogInputFocused])

  const showToast = useCallback((message: string, undo?: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, undo })
    toastTimerRef.current = setTimeout(() => setToast(null), undo ? 5000 : 3000)
  }, [])

  const undoEntries = useCallback(async (entries: Entry | Entry[]) => {
    const list = Array.isArray(entries) ? entries : [entries]
    await Promise.all(list.map((entry) => deleteEntry(entry.id)))
    setToast(null)
    await loadData()
  }, [loadData])

  const queuePendingLog = useCallback(async (rawInput: string) => {
    await addPendingLog(rawInput)
    setInput('')
    setPendingRetryId(null)
    showToast('Queued offline')
    await loadData()
  }, [loadData, showToast])

  const openLocalParsedEntry = useCallback((rawInput: string) => {
    const parsed = parseLocalEntry(rawInput, categories)
    if (!parsed) return false
    setPendingParsedSource('manual')
    setPendingRawInput(`local: ${rawInput}`)
    setPendingParsed(parsed)
    return true
  }, [categories])

  const enrichParsedEntry = useCallback((rawInput: string, parsed: ParsedEntry): ParsedEntry => {
    const categoryIds = refineCategoryIdsForInput(rawInput, categories, parsed.categoryIds)
    return {
      ...parsed,
      categoryIds,
      tags: inferEntryTags(rawInput, categories, categoryIds, parsed.tags),
    }
  }, [categories])

  const parseLogInput = useCallback(async (
    rawInput: string,
    options: { pendingId?: string; queueOnFailure?: boolean } = {}
  ) => {
    const { pendingId, queueOnFailure = true } = options

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (queueOnFailure && !openLocalParsedEntry(rawInput)) await queuePendingLog(rawInput)
      else showToast('Still offline. Try again when connected.')
      return
    }

    try {
      if (pendingId) await updatePendingLogStatus(pendingId, 'retrying')
      const corrections = await getRecentCorrections(10)
      const bulkAutoDetect = await getSetting('bulkEntryAutoDetect')
      const tagSuggestionsEnabled = await getSetting('tagSuggestionsEnabled')
      let intent = 'single'

      if (bulkAutoDetect !== false) {
        const intentRes = await fetch('/api/detect-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawInput }),
        })
        const intentJson = await intentRes.json()
        intent = intentJson.intent
      }

      if (intent === 'bulk') {
        const bulkRes = await fetch('/api/parse-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawInput,
            today: getTodayString(),
            yesterday: getYesterdayString(),
            categories: categories.map((c) => ({
              id: c.id, name: c.name, emoji: c.emoji,
            })),
            corrections,
          }),
        })
        if (!bulkRes.ok) throw new Error('Bulk parse failed')
        const parsed: ParsedEntry[] = await bulkRes.json()
        const enriched = parsed.map((entry) => enrichParsedEntry(rawInput, entry))
        setPendingRetryId(pendingId ?? null)
        setPendingRawInput(rawInput)
        setPendingBulk(tagSuggestionsEnabled === false
          ? enriched.map((entry) => ({ ...entry, tags: [] }))
          : enriched
        )
      } else {
        const singleRes = await fetch('/api/parse-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawInput,
            today: getTodayString(),
            yesterday: getYesterdayString(),
            categories: categories.map((c) => ({
              id: c.id, name: c.name, emoji: c.emoji,
            })),
            corrections,
          }),
        })
        if (!singleRes.ok) throw new Error('AI parse failed')
        const parsed: ParsedEntry = await singleRes.json()
        const enriched = enrichParsedEntry(rawInput, parsed)
        setPendingParsedSource('ai')
        setPendingRetryId(pendingId ?? null)
        setPendingRawInput(rawInput)
        setPendingParsed(tagSuggestionsEnabled === false ? { ...enriched, tags: [] } : enriched)
      }
      setInput('')
    } catch (e) {
      console.error(e)
      if (queueOnFailure) {
        if (!openLocalParsedEntry(rawInput)) await queuePendingLog(rawInput)
      } else {
        if (pendingId) {
          await updatePendingLogStatus(
            pendingId,
            'failed',
            e instanceof Error ? e.message : 'Retry failed'
          )
          await loadData()
        }
        showToast('Retry failed. Pending log kept.')
      }
    }
  }, [categories, enrichParsedEntry, loadData, openLocalParsedEntry, queuePendingLog, showToast])

  const retryPendingLog = useCallback(async (entry: Entry, automatic = false) => {
    if (loading || pendingParsed || pendingBulk) return
    if (!canRetryPendingLog(entry)) return
    if (automatic) autoRetryIdRef.current = entry.id
    setLoading(true)
    await parseLogInput(entry.rawInput, {
      pendingId: entry.id,
      queueOnFailure: false,
    })
    setLoading(false)
  }, [loading, parseLogInput, pendingBulk, pendingParsed])

  const retryAllPendingLogs = useCallback(async () => {
    if (loading || pendingParsed || pendingBulk) return
    const next = pendingLogs.find(canRetryPendingLog)
    if (!next) {
      showToast('No retryable logs')
      return
    }
    await retryPendingLog(next)
  }, [loading, pendingBulk, pendingLogs, pendingParsed, retryPendingLog, showToast])

  useEffect(() => {
    const handleOnline = () => {
      autoRetryIdRef.current = null
      loadData()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [loadData])

  useEffect(() => {
    if (mode !== 'log' || loading || pendingParsed || pendingBulk) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const nextPending = pendingLogs.find(canRetryPendingLog)
    if (!nextPending || autoRetryIdRef.current === nextPending.id) return
    retryPendingLog(nextPending, true)
  }, [mode, loading, pendingLogs, pendingParsed, pendingBulk, retryPendingLog])

  useEffect(() => {
    if (mode !== 'log' || loading || pendingParsed || pendingBulk || pendingRecurringRule) return
    let cancelled = false

    const openDueRecurring = async () => {
      const dueRules = await getDueRecurringRules(getTodayString())
      const nextRule = dueRules[0]
      if (!nextRule || cancelled) return
      setPendingRecurringRule(nextRule)
      setPendingParsedSource('manual')
      setPendingRawInput(`recurring: ${nextRule.entryTemplate.note || 'scheduled entry'}`)
      setPendingParsed({
        ...nextRule.entryTemplate,
        date: getTodayString(),
        confidence: 'high',
      })
    }

    openDueRecurring().catch((e: Error) => console.error(e))
    return () => {
      cancelled = true
    }
  }, [mode, loading, pendingBulk, pendingParsed, pendingRecurringRule])

  // ── Voice input ────────────────────────────────────────
  const toggleMic = () => {
    if (typeof window === 'undefined') return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast('Voice input needs internet in this browser.')
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Voice input not supported in this browser.'); return }
    if (listening) {
      micStoppedManuallyRef.current = true
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const recognition = new SR()
    finalTranscriptRef.current = ''
    micEndedWithErrorRef.current = false
    micStoppedManuallyRef.current = false
    recognition.lang = 'en-IN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    recognition.onresult = (e) => {
      let latestFinal = ''
      for (let i = e.results.length - 1; i >= 0; i -= 1) {
        const result = e.results[i]
        const alternatives = Array.from({ length: result.length }, (_, index) => result[index])
        const best = chooseRomanMicTranscript(alternatives)
        if (result.isFinal && best) {
          latestFinal = best
          break
        }
      }
      if (!latestFinal) return
      finalTranscriptRef.current = latestFinal
      setInput((prev) => [prev.trim(), latestFinal].filter(Boolean).join(' '))
    }
    recognition.onerror = (event) => {
      setListening(false)
      micEndedWithErrorRef.current = true
      const messageMap: Record<string, string> = {
        'not-allowed': 'Mic permission blocked. Allow microphone access and try again.',
        denied: 'Mic permission blocked. Allow microphone access and try again.',
        'no-speech': 'I did not catch that. Try speaking a little closer to the mic.',
        network: 'Voice input needs internet in this browser.',
        'audio-capture': 'No microphone found. Check your mic and try again.',
      }
      showToast(messageMap[event.error] ?? 'Voice input stopped. Please try again.')
    }
    recognition.onend = () => {
      setListening(false)
      if (!finalTranscriptRef.current && !micEndedWithErrorRef.current && !micStoppedManuallyRef.current) {
        showToast('I did not catch that. Try speaking a little closer to the mic.')
      }
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      showToast('Could not start voice input. Please try again.')
    }
  }

  // ── Log Mode send ──────────────────────────────────────
  const looksLikeQuery = (value: string) =>
    /^(how much|show me|find|what|when|where|did i|am i|list|total|biggest|average|count)\b/i.test(value) ||
    includesAnyWord(value, HINGLISH_QUERY_STARTERS) ||
    /\b(kitna|kitne|dikhao|dikhado|batao|btao|kharch hua|kharcha hua|gaya)\b/i.test(value) ||
    value.trim().endsWith('?')

  const handleLogSend = async (trimmed: string) => {
    if (looksLikeQuery(trimmed) && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      try {
        const intentRes = await fetch('/api/ask-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, chatHistory: [] }),
        })
        const { intent } = await intentRes.json()
        if (intent === 'query' || intent === 'unclear') {
          setLogGuardInput(trimmed)
          return
        }
      } catch {
        setLogGuardInput(trimmed)
        return
      }
    }

    setLoading(true)
    await parseLogInput(trimmed)
    setLoading(false)
  }

  // ── Ask Mode send ──────────────────────────────────────
  const handleAskSend = async (trimmed: string) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast('Ask Mode needs internet')
      return
    }

    setLoading(true)
    setInput('')
    try {
      const result = await ask(trimmed)
      if (result === null) {
        // Intent was log — switch to log mode
        setMode('log')
        setInput(trimmed)
        showToast('💡 Switched to Log Mode')
      } else if (result.displayMode === 'navigate' && result.filters) {
        onNavigateToHistory(result.filters)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickQuestion = async (question: QuickQuestion) => {
    if (loading) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showToast('Ask Mode needs internet')
      return
    }

    setLoading(true)
    try {
      const result = await askQuickQuestion(question)
      if (result?.displayMode === 'navigate' && result.filters) {
        onNavigateToHistory(result.filters)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    if (mode === 'log') handleLogSend(trimmed)
    else handleAskSend(trimmed)
  }

  // ── Repeat entry ──────────────────────────────────────
  const handleRepeat = (entry: Entry) => {
    setSelectedEntry(null)
    setPendingParsedSource('manual')
    setPendingParsed({
      type: entry.type,
      amount: entry.amount,
      categoryIds: entry.categoryIds,
      date: getTodayString(),
      note: entry.note,
      tags: entry.tags,
      confidence: 'high',
    })
    setPendingRawInput(`repeat: ${entry.note || entry.rawInput}`)
  }

  const budgetPercent = monthBudget
    ? Math.min((monthSpend / monthBudget) * 100, 100)
    : null
  const daysElapsed = new Date().getDate()
  const dailyAverage = monthSpend > 0 ? monthSpend / daysElapsed : 0
  const budgetLeft = monthBudget !== null ? Math.max(monthBudget - monthSpend, 0) : null
  const fallbackInsight = monthBudget
    ? monthSpend >= monthBudget
      ? {
          tone: 'danger',
          title: 'Budget limit reached',
          copy: `${formatCurrency(monthSpend - monthBudget)} over your monthly plan.`,
          filters: undefined,
        }
      : budgetPercent !== null && budgetPercent >= 80
      ? {
          tone: 'warning',
          title: 'Budget running hot',
          copy: `${formatCurrency(budgetLeft ?? 0)} left this month. Slow days help now.`,
          filters: undefined,
        }
      : {
          tone: 'good',
          title: 'On track this month',
          copy: `${formatCurrency(budgetLeft ?? 0)} left against your monthly budget.`,
          filters: undefined,
        }
    : {
        tone: 'neutral',
        title: 'Set a monthly budget',
        copy: 'Add a budget to unlock smarter spend alerts.',
        filters: undefined,
      }
  const primaryInsight = localInsights[0]
  const insight = primaryInsight
    ? {
        tone: primaryInsight.tone,
        title: primaryInsight.title,
        copy: primaryInsight.detail,
        filters: primaryInsight.filters,
      }
    : fallbackInsight

  const getCategoryNames = (ids: string[]) =>
    ids
      .map((id) => categories.find((c) => c.id === id)?.name ?? '')
      .filter(Boolean)
      .join(', ')

  const askStatusLabel: Record<string, string> = {
    classifying: '🤔 Thinking...',
    translating: '🔍 Understanding query...',
    querying: '⚡ Fetching data...',
    formatting: '✍️ Preparing answer...',
    error: '❌ Something went wrong',
  }

  return (
    <div className="flex min-h-full flex-col">

      {/* ── Header ── */}
      <div className="border-b border-slate-200 bg-white/90 px-4 pb-4 pt-5 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Expense dashboard</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Today</h1>
          </div>
          <p className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
            {formatDisplayDate(getTodayString())}
          </p>
        </div>

        <div className="dashboard-card overflow-hidden p-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricTile icon={CircleDollarSign} label="Today spent" value={formatCurrency(todaySpend)} strong />
            <MetricTile icon={Wallet} label="Month spent" value={formatCurrency(monthSpend)} />
            <MetricTile
              icon={TrendingDown}
              label="Budget left"
              value={budgetLeft === null ? 'Not set' : formatCurrency(budgetLeft)}
            />
            <MetricTile icon={Sparkles} label="Daily avg" value={formatCurrency(dailyAverage)} />
          </div>
          {monthBudget && budgetPercent !== null ? (
            <div className="mt-4 space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    budgetPercent >= 100
                      ? 'bg-red-500'
                      : budgetPercent >= 80
                      ? 'bg-amber-500'
                      : 'bg-indigo-600'
                  }`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
              <p className="text-xs font-medium text-slate-500">
                {formatCurrency(monthSpend)} of {formatCurrency(monthBudget)} monthly budget
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs font-medium text-slate-400">No budget set yet</p>
          )}
        </div>

        <div className={`mt-3 rounded-2xl border px-4 py-3 ${
          insight.tone === 'danger'
            ? 'border-red-100 bg-red-50'
            : insight.tone === 'warning'
            ? 'border-amber-100 bg-amber-50'
            : insight.tone === 'good'
            ? 'border-emerald-100 bg-emerald-50'
            : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            type="button"
            onClick={() => insight.filters && onNavigateToHistory(insight.filters)}
            disabled={!insight.filters}
            className="w-full text-left disabled:pointer-events-none"
          >
            <p className="text-sm font-bold text-slate-900">{insight.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{insight.copy}</p>
          </button>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <QuickAddTileRow
        categories={categories}
        onSaved={(entry) => {
          showToast('Quick Action saved', () => undoEntries(entry))
          loadData()
        }}
        onShowToast={showToast}
        onNavigateToHistory={onNavigateToHistory}
      />

      {/* ── Input area ── */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-3 shadow-sm backdrop-blur">
        {/* Mode toggle */}
        <div className="mb-3 flex rounded-2xl bg-slate-100 p-1" role="tablist">
          {(['log', 'ask'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                mode === m
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-400'
              }`}
            >
              {m === 'log' ? 'Log' : 'Ask'}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualEntryRawInput('')}
            aria-label="Add manual entry"
            className="rounded-2xl bg-slate-100 p-2.5 text-slate-500 transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>

          <div className="flex flex-1 items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2.5">
            {mode === 'ask' ? <Search className="h-4 w-4 text-slate-400" /> : <Check className="h-4 w-4 text-slate-400" />}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={
                mode === 'log'
                  ? 'e.g. 100 auto to badminton...'
                  : 'Ask anything about your spending...'
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              onClick={toggleMic}
              aria-label="Voice input"
              className={`p-1 rounded-lg transition-colors ${
                listening
                  ? 'text-red-500 animate-pulse'
                  : 'text-slate-400 active:text-indigo-500'
              }`}
            >
              <Mic className="h-5 w-5" />
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            aria-label="Send"
            className="rounded-2xl bg-indigo-600 p-2.5 text-white transition-transform active:scale-95 disabled:opacity-40"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Ask Mode status */}
        {mode === 'ask' && askStatus !== 'idle' && (
          <p className="text-xs text-indigo-400 text-center mt-2">
            {askStatusLabel[askStatus]}
          </p>
        )}
      </div>

      {/* ── Ask Mode chat area ── */}
      {mode === 'ask' && (
        <div className="flex-1">
          <ChatBubbles
            messages={chatMessages}
            quickQuestions={quickQuestions}
            onQuickQuestion={handleQuickQuestion}
            onViewDetails={(filters) => onNavigateToHistory(filters)}
          />
        </div>
      )}

      {/* ── Log Mode recent entries ── */}
      {mode === 'log' && (
        <div className="flex-1 px-4 pt-4">
          {pendingLogs.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Offline queue</p>
                  <p className="text-xs text-slate-400">Retries automatically when you are online.</p>
                </div>
                <button
                  onClick={retryAllPendingLogs}
                  disabled={loading || !pendingLogs.some(canRetryPendingLog)}
                  className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 disabled:opacity-40"
                >
                  Retry all ({pendingLogs.length})
                </button>
              </div>
              <div className="space-y-2">
                {pendingLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-3"
                  >
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {entry.rawInput}
                    </p>
                    <p className="text-xs text-yellow-700 mt-0.5">
                      {getPendingLogStatusLabel(getPendingLogStatus(entry))} · queued {timeAgo(entry.createdAt)}
                    </p>
                    {entry.pendingError && (
                      <p className="mt-1 line-clamp-2 text-xs text-red-500">{entry.pendingError}</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => retryPendingLog(entry)}
                        disabled={loading || !canRetryPendingLog(entry)}
                        className="flex-1 py-2 rounded-lg bg-white text-indigo-600 text-xs font-semibold disabled:opacity-50"
                      >
                        {getPendingLogStatus(entry) === 'retrying' ? 'Retrying...' : 'Retry'}
                      </button>
                      <button
                        onClick={async () => {
                          await deletePendingLog(entry.id)
                          showToast('Pending log deleted')
                          loadData()
                        }}
                        className="flex-1 py-2 rounded-lg bg-white text-red-500 text-xs font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Recent</p>
            <button
              onClick={onViewAll}
              className="text-xs text-indigo-500 font-medium"
            >
              View all
            </button>
          </div>

          {recentEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="text-4xl">🌱</span>
              <p className="text-sm text-gray-400 text-center">
                No entries yet. Tap mic, type, or use a Quick Action.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className="w-full flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm active:scale-[0.98] transition-transform text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {entry.note || getCategoryNames(entry.categoryIds)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {getCategoryNames(entry.categoryIds)} · {timeAgo(entry.createdAt)}
                    </p>
                    {entry.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-indigo-50 text-indigo-400 px-1.5 py-0.5 rounded-full"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-3">
                    <p className={`text-sm font-semibold ${
                      entry.type === 'income' ? 'text-green-600' : 'text-gray-800'
                    }`}>
                      {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}

      {pendingParsed && (
        <ConfirmEntryModal
          rawInput={pendingRawInput}
          parsed={pendingParsed}
          categories={categories}
          source={pendingParsedSource}
          onSave={async (entry) => {
            const retriedPendingId = pendingRetryId
            if (retriedPendingId) await deletePendingLog(retriedPendingId)
            if (pendingRecurringRule) await advanceRecurringRule(pendingRecurringRule)
            setPendingParsed(null)
            setPendingRawInput('')
            setPendingRetryId(null)
            setPendingRecurringRule(null)
            showToast('✅ Saved!', () => undoEntries(entry))
            loadData()
          }}
          onCancel={() => {
            if (pendingRetryId) void updatePendingLogStatus(pendingRetryId, 'pending')
            setPendingParsed(null)
            setPendingRawInput('')
            setPendingRetryId(null)
            setPendingRecurringRule(null)
          }}
        />
      )}

      {pendingBulk && (
        <BulkConfirmModal
          rawInput={pendingRawInput}
          parsed={pendingBulk}
          categories={categories}
          onSave={async (entries) => {
            const retriedPendingId = pendingRetryId
            if (retriedPendingId) await deletePendingLog(retriedPendingId)
            setPendingBulk(null)
            setPendingRawInput('')
            setPendingRetryId(null)
            showToast(`✅ Saved ${entries.length} entries!`, () => undoEntries(entries))
            loadData()
          }}
          onCancel={() => {
            if (pendingRetryId) void updatePendingLogStatus(pendingRetryId, 'pending')
            setPendingBulk(null)
            setPendingRawInput('')
            setPendingRetryId(null)
          }}
        />
      )}

      {selectedEntry && (
        <EntryDetailModal
          entry={selectedEntry}
          categories={categories}
          onClose={() => setSelectedEntry(null)}
          onDeleted={() => {
            setSelectedEntry(null)
            showToast('🗑 Entry deleted')
            loadData()
          }}
          onEdit={(entry) => {
            setSelectedEntry(null)
            setEditingEntry(entry)
          }}
          onNavigateToHistory={(filters) => {
            setSelectedEntry(null)
            onNavigateToHistory(filters)
          }}
          onRepeat={handleRepeat}
        />
      )}

      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          categories={categories}
          onSave={() => {
            setEditingEntry(null)
            showToast('✅ Entry updated')
            loadData()
          }}
          onCancel={() => setEditingEntry(null)}
        />
      )}

      {manualEntryRawInput !== null && (
        <ManualEntryModal
          categories={categories}
          initialRawInput={manualEntryRawInput}
          onSave={(entry) => {
            setManualEntryRawInput(null)
            showToast('✅ Manual entry saved', () => undoEntries(entry))
            loadData()
          }}
          onCancel={() => setManualEntryRawInput(null)}
        />
      )}

      {disambiguation && (
        <DisambiguationModal
          input={disambiguation.input}
          onLog={() => {
            setManualEntryRawInput(disambiguation.input)
            disambiguation.resolve('log')
          }}
          onQuery={() => disambiguation.resolve('query')}
          onCancel={() => {
            disambiguation.resolve('log')
          }}
        />
      )}

      {logGuardInput && (
        <DisambiguationModal
          input={logGuardInput}
          onLog={() => {
            setManualEntryRawInput(logGuardInput)
            setLogGuardInput(null)
            setInput('')
          }}
          onQuery={() => {
            const value = logGuardInput
            setLogGuardInput(null)
            setMode('ask')
            handleAskSend(value)
          }}
          onCancel={() => setLogGuardInput(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] flex justify-center px-4">
          <div className="bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg flex items-center gap-3">
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                onClick={toast.undo}
                className="text-indigo-200 font-semibold"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
