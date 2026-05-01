'use client'

import { useEffect, useState, useCallback } from 'react'
import { CalendarDays, Filter, Layers3, Search, X } from 'lucide-react'
import { getAllEntries, getCategories } from '@/lib/db'
import { Entry, Category, EntrySource, PAYMENT_METHOD_OPTIONS, PaymentMethod, getPaymentMethodLabel } from '@/lib/types'
import { formatCurrency, formatDisplayDate, getTodayString, timeAgo } from '@/lib/utils'
import EntryDetailModal from '@/components/EntryDetailModal'
import EditEntryModal from '@/components/EditEntryModal'
import ConfirmEntryModal from '@/components/ConfirmEntryModal'
import { useModalDismiss } from '@/lib/useModalDismiss'
import ModalShell from '@/components/ModalShell'


type FilterType = 'all' | 'expense' | 'income'
type SourceFilter = 'all' | EntrySource
type PaymentMethodFilter = 'all' | 'unspecified' | PaymentMethod

interface Filters {
  type: FilterType
  source: SourceFilter
  paymentMethod: PaymentMethodFilter
  categoryIds: string[]
  tags: string[]
  dateFrom: string
  dateTo: string
  amountMin: string
  amountMax: string
  bulkBatchId: string
  search: string
}
interface Props {
  preFilters?: object | null
}

const DEFAULT_FILTERS: Filters = {
  type: 'all',
  source: 'all',
  paymentMethod: 'all',
  categoryIds: [],
  tags: [],
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  bulkBatchId: '',
  search: '',
}

function normalizeFilters(filters?: Partial<Filters> | null): Filters {
  const paymentMethods = (filters as Partial<Filters> & { paymentMethods?: PaymentMethod[] | null } | null)?.paymentMethods
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    type: filters?.type ?? DEFAULT_FILTERS.type,
    source: filters?.source ?? DEFAULT_FILTERS.source,
    paymentMethod: filters?.paymentMethod ?? paymentMethods?.[0] ?? DEFAULT_FILTERS.paymentMethod,
    categoryIds: filters?.categoryIds ?? DEFAULT_FILTERS.categoryIds,
    tags: filters?.tags ?? DEFAULT_FILTERS.tags,
    dateFrom: filters?.dateFrom ?? DEFAULT_FILTERS.dateFrom,
    dateTo: filters?.dateTo ?? DEFAULT_FILTERS.dateTo,
    amountMin: filters?.amountMin ?? DEFAULT_FILTERS.amountMin,
    amountMax: filters?.amountMax ?? DEFAULT_FILTERS.amountMax,
    bulkBatchId: filters?.bulkBatchId ?? DEFAULT_FILTERS.bulkBatchId,
    search: filters?.search ?? DEFAULT_FILTERS.search,
  }
}

export default function HistoryScreen({ preFilters }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [repeatEntry, setRepeatEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (preFilters) {
      const f = preFilters as Partial<Filters>
      setFilters((prev) => normalizeFilters({ ...prev, ...f }))
    }
  }, [preFilters])
  

  const loadData = useCallback(async () => {
    setLoading(true)
    const [all, cats] = await Promise.all([getAllEntries(), getCategories()])
    setEntries(all)
    setCategories(cats)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Apply filters ────────────────────────────────────────
  const filtered = entries.filter((e) => {
    if (filters.type !== 'all' && e.type !== filters.type) return false
    if (filters.source !== 'all' && e.source !== filters.source) return false
    if (filters.paymentMethod === 'unspecified' && e.paymentMethod) return false
    if (filters.paymentMethod !== 'all' && filters.paymentMethod !== 'unspecified' && e.paymentMethod !== filters.paymentMethod) return false
    if (filters.bulkBatchId && e.bulkBatchId !== filters.bulkBatchId) return false
    if ((filters.categoryIds ?? []).length > 0 &&
      !filters.categoryIds.some((id) => e.categoryIds.includes(id))) return false
    if ((filters.tags ?? []).length > 0 &&
      !filters.tags.some((tag) => e.tags.includes(tag))) return false
    if (filters.dateFrom && e.date < filters.dateFrom) return false
    if (filters.dateTo && e.date > filters.dateTo) return false
    if (filters.amountMin && e.amount < Number(filters.amountMin)) return false
    if (filters.amountMax && e.amount > Number(filters.amountMax)) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const matchNote = e.note.toLowerCase().includes(q)
      const matchRaw = e.rawInput.toLowerCase().includes(q)
      const matchPayment = getPaymentMethodLabel(e.paymentMethod).toLowerCase().includes(q)
      const matchCat = e.categoryIds.some((id) =>
        categories.find((c) => c.id === id)?.name.toLowerCase().includes(q)
      )
      if (!matchNote && !matchRaw && !matchPayment && !matchCat) return false
    }
    return true
  })

  // ── Group by date ────────────────────────────────────────
  const grouped = filtered.reduce<Record<string, Entry[]>>((acc, entry) => {
    const key = entry.date
    if (!acc[key]) acc[key] = []
    acc[key].push(entry)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
  const calendarDays = sortedDates.slice(0, 14).map((date) => ({
    date,
    count: grouped[date].length,
    total: grouped[date]
      .filter((entry) => entry.type === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0),
  }))
  const duplicateCandidates = filtered.filter((entry, index) =>
    filtered.slice(0, index).some((other) =>
      other.id !== entry.id &&
      other.date === entry.date &&
      other.amount === entry.amount &&
      (other.note || other.rawInput).toLowerCase() === (entry.note || entry.rawInput).toLowerCase()
    )
  )

  const getCategoryNames = (ids: string[]) =>
    ids.map((id) => categories.find((c) => c.id === id)?.name ?? '').filter(Boolean).join(', ')

  const activeFilterCount = [
    filters.type !== 'all',
    filters.source !== 'all',
    filters.paymentMethod !== 'all',
    (filters.categoryIds ?? []).length > 0,
    (filters.tags ?? []).length > 0,
    filters.dateFrom !== '',
    filters.dateTo !== '',
    filters.amountMin !== '',
    filters.amountMax !== '',
    filters.bulkBatchId !== '',
  ].filter(Boolean).length

  // ── All tags used across entries ─────────────────────────
  const allTags = [...new Set(entries.flatMap((e) => e.tags))].sort()
  const handleRepeat = (entry: Entry) => {
    setSelectedEntry(null)
    setRepeatEntry(entry)
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-5 backdrop-blur">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Ledger</p>
            <h1 className="text-2xl font-bold text-slate-950">History</h1>
          </div>
          <button
            onClick={() => setShowFilters(true)}
            className="relative flex shrink-0 items-center gap-1.5 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600"
          >
            <Filter className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="mobile-safe-row flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            value={filters.search ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search entries..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {filters.search && (
            <button
              onClick={() => setFilters((f) => ({ ...f, search: '' }))}
              className="text-slate-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {filters.type !== 'all' && (
              <span className="max-w-full truncate rounded-full bg-indigo-50 px-2 py-1 text-xs capitalize text-indigo-500">
                {filters.type}
              </span>
            )}
            {filters.source !== 'all' && (
              <span className="max-w-full truncate rounded-full bg-indigo-50 px-2 py-1 text-xs capitalize text-indigo-500">
                {filters.source}
              </span>
            )}
            {filters.paymentMethod !== 'all' && (
              <span className="max-w-full truncate rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-500">
                {filters.paymentMethod === 'unspecified'
                  ? 'Unspecified'
                  : getPaymentMethodLabel(filters.paymentMethod)}
              </span>
            )}
            {(filters.tags ?? []).map((tag) => (
              <span key={tag} className="max-w-full truncate rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-500">
                #{tag}
              </span>
            ))}
            {(filters.amountMin || filters.amountMax) && (
              <span className="max-w-full truncate rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-500">
                {filters.amountMin || '0'}-{filters.amountMax || 'any'}
              </span>
            )}
            {filters.bulkBatchId && (
              <span className="max-w-full truncate rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-500">
                Bulk batch
              </span>
            )}
            <button
              onClick={() => setFilters(normalizeFilters())}
              className="text-xs text-red-400 font-medium"
            >
              Reset
            </button>
          </div>
        )}

        {calendarDays.length > 0 && (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                <CalendarDays className="h-3.5 w-3.5" /> Calendar
              </p>
              {duplicateCandidates.length > 0 && (
                <button
                  onClick={() => setFilters((f) => ({ ...f, search: duplicateCandidates[0].note || duplicateCandidates[0].rawInput }))}
                  className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700"
                >
                  <Layers3 className="h-3 w-3" />
                  {duplicateCandidates.length} possible duplicate{duplicateCandidates.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {calendarDays.map((day) => {
                const selected = filters.dateFrom === day.date && filters.dateTo === day.date
                const parsed = new Date(`${day.date}T00:00:00`)
                return (
                  <button
                    key={day.date}
                    onClick={() => setFilters((f) => ({
                      ...f,
                      dateFrom: selected ? '' : day.date,
                      dateTo: selected ? '' : day.date,
                    }))}
                    className={`min-w-16 rounded-2xl px-3 py-2 text-left shadow-sm ${
                      selected ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'
                    }`}
                  >
                    <span className="block text-[10px] font-bold uppercase opacity-70">
                      {parsed.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </span>
                    <span className="block text-base font-black">{parsed.getDate()}</span>
                    <span className="block truncate text-[10px] font-semibold opacity-70">
                      {day.count} · {formatCurrency(day.total)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Entry count */}
      {!loading && (
        <div className="px-4 py-2">
          <p className="text-xs text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
            {activeFilterCount > 0 && ' (filtered)'}
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-400 text-sm">Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-4xl">🔍</span>
            <p className="text-sm text-gray-400 text-center">
              {entries.length === 0
                ? 'No entries yet. Start logging!'
                : 'No entries match your filters.'}
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters(normalizeFilters())}
                className="text-sm text-indigo-500 font-medium mt-1"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {sortedDates.map((date) => {
              const dayEntries = grouped[date]
              const dayTotal = dayEntries
                .filter((e) => e.type === 'expense')
                .reduce((s, e) => s + e.amount, 0)

              return (
                <div key={date}>
                  {/* Date header */}
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {formatDisplayDate(date)}
                    </p>
                    {dayTotal > 0 && (
                      <p className="shrink-0 text-xs font-semibold text-gray-500">
                        {formatCurrency(dayTotal)}
                      </p>
                    )}
                  </div>

                  {/* Entries for this date */}
                  <div className="space-y-2">
                    {dayEntries.map((entry) => (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedEntry(entry)}
                        className="mobile-safe-row flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left shadow-sm transition-transform active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Category emoji */}
                          <span className="text-xl shrink-0">
                            {categories.find(
                              (c) => c.id === entry.categoryIds[0]
                            )?.emoji ?? '📦'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {entry.note || getCategoryNames(entry.categoryIds)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-gray-400">
                              {getCategoryNames(entry.categoryIds)} · {getPaymentMethodLabel(entry.paymentMethod)}
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
                        </div>
                        <div className="ml-3 max-w-[42%] shrink-0 text-right">
                          <p className={`truncate text-sm font-semibold ${
                            entry.type === 'income' ? 'text-green-600' : 'text-gray-800'
                          }`}>
                            {entry.type === 'income' ? '+' : '-'}{formatCurrency(entry.amount)}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {timeAgo(entry.createdAt)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Filter Modal */}
      {showFilters && (
        <FilterModal
          filters={filters}
          categories={categories}
          allTags={allTags}
          onApply={(f) => { setFilters(normalizeFilters(f)); setShowFilters(false) }}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Entry Detail Modal */}
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
          onNavigateToHistory={(nextFilters) => {
            setSelectedEntry(null)
            setFilters((prev) => normalizeFilters({ ...prev, ...nextFilters as Partial<Filters> }))
          }}
          onRepeat={handleRepeat}
        />
      )}

      {/* Edit Entry Modal */}
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

      {repeatEntry && (
        <ConfirmEntryModal
          rawInput={`repeat: ${repeatEntry.note || repeatEntry.rawInput}`}
          parsed={{
            type: repeatEntry.type,
            amount: repeatEntry.amount,
            categoryIds: repeatEntry.categoryIds,
            paymentMethod: repeatEntry.paymentMethod ?? null,
            date: getTodayString(),
            note: repeatEntry.note,
            tags: repeatEntry.tags,
            confidence: 'high',
          }}
          categories={categories}
          source="manual"
          onSave={() => {
            setRepeatEntry(null)
            showToast('Repeated entry saved')
            loadData()
          }}
          onCancel={() => setRepeatEntry(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 right-0 z-[60] flex justify-center px-4">
          <div className="bg-gray-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Filter Modal ─────────────────────────────────────────────
function FilterModal({
  filters,
  categories,
  allTags,
  onApply,
  onClose,
}: {
  filters: Filters
  categories: Category[]
  allTags: string[]
  onApply: (f: Filters) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<Filters>(() => normalizeFilters(filters))
  const isDirty = JSON.stringify(local) !== JSON.stringify(filters)
  const { requestClose, backdropProps } = useModalDismiss({ isDirty, onClose })

  const toggleCategory = (id: string) => {
    setLocal((f) => ({
      ...f,
      categoryIds: f.categoryIds.includes(id)
        ? f.categoryIds.filter((c) => c !== id)
        : [...f.categoryIds, id],
    }))
  }

  const toggleTag = (tag: string) => {
    setLocal((f) => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter((t) => t !== tag)
        : [...f.tags, tag],
    }))
  }

  return (
    <ModalShell
      title="Filters"
      onClose={requestClose}
      backdropProps={backdropProps}
      bodyClassName="px-4 py-4 space-y-5"
      headerEnd={
        <button
          onClick={() => setLocal(normalizeFilters())}
          className="text-sm font-medium text-indigo-500"
        >
          Reset
        </button>
      }
      footer={
        <button
          onClick={() => onApply(local)}
          className="w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white transition-transform active:scale-95"
        >
          Apply Filters
        </button>
      }
    >

          {/* Type */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type</p>
            <div className="flex gap-2">
              {(['all', 'expense', 'income'] as FilterType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setLocal((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${
                    local.type === t
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Source</p>
            <div className="grid grid-cols-3 gap-2">
              {(['all', 'ai', 'manual', 'quickAdd', 'bulk'] as SourceFilter[]).map((source) => (
                <button
                  key={source}
                  onClick={() => setLocal((f) => ({ ...f, source }))}
                  className={`py-2 rounded-xl text-xs font-medium transition-colors capitalize ${
                    local.source === source
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {source === 'quickAdd' ? 'Action' : source}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Payment Method
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'all', label: 'All' },
                ...PAYMENT_METHOD_OPTIONS,
                { value: 'unspecified', label: 'Unspecified' },
              ] as Array<{ value: PaymentMethodFilter; label: string }>).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setLocal((f) => ({ ...f, paymentMethod: option.value }))}
                  className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${
                    local.paymentMethod === option.value
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Categories
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.filter((c) => !c.archived).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                    (local.categoryIds ?? []).includes(cat.id)
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      (local.tags ?? []).includes(tag)
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-100 text-indigo-500'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date range */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Date Range
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-100 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-gray-400 mb-0.5">From</p>
                <input
                  type="date"
                  value={local.dateFrom}
                  onChange={(e) => setLocal((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full bg-transparent text-sm text-gray-800 outline-none"
                />
              </div>
              <div className="bg-gray-100 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-gray-400 mb-0.5">To</p>
                <input
                  type="date"
                  value={local.dateTo}
                  onChange={(e) => setLocal((f) => ({ ...f, dateTo: e.target.value }))}
                  className="w-full bg-transparent text-sm text-gray-800 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Amount range */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Amount Range
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-100 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-gray-400 mb-0.5">Min</p>
                <input
                  type="number"
                  value={local.amountMin}
                  onChange={(e) => setLocal((f) => ({ ...f, amountMin: e.target.value }))}
                  className="w-full bg-transparent text-sm text-gray-800 outline-none"
                  inputMode="decimal"
                />
              </div>
              <div className="bg-gray-100 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-gray-400 mb-0.5">Max</p>
                <input
                  type="number"
                  value={local.amountMax}
                  onChange={(e) => setLocal((f) => ({ ...f, amountMax: e.target.value }))}
                  className="w-full bg-transparent text-sm text-gray-800 outline-none"
                  inputMode="decimal"
                />
              </div>
            </div>
          </div>
    </ModalShell>
  )
}
