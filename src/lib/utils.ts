// Returns YYYY-MM-DD using the user's local calendar date.
export function formatLocalDateString(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getYesterdayString(): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return formatLocalDateString(yesterday)
}

// Format: "Today, 28 Apr" or "28 Apr"
export function formatDisplayDate(dateStr: string): string {
  const today = getTodayString()
  const date = new Date(dateStr + 'T00:00:00')
  const formatted = date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
  if (dateStr === today) return `Today, ${formatted}`
  if (dateStr === getYesterdayString()) return `Yesterday, ${formatted}`
  return formatted
}

// Returns YYYY-MM-DD for today
export function getTodayString(): string {
  return formatLocalDateString()
}

// Returns first day of current month: YYYY-MM-01
export function getMonthStartString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

// Format number as ₹1,234
export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

// Returns time ago: "2h ago", "just now"
export function timeAgo(createdAt: number): string {
  const diff = Date.now() - createdAt
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
// Get start/end strings for a period
export function getPeriodRange(period: 'this_month' | 'last_month' | '3_months'): {
  start: string
  end: string
} {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')

  if (period === 'this_month') {
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
    const end = getTodayString()
    return { start, end }
  }

  if (period === 'last_month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    const end = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`
    return { start, end }
  }

  // 3 months
  const d = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const start = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
  return { start, end: getTodayString() }
}
