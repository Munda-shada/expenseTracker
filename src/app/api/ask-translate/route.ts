import { NextRequest, NextResponse } from 'next/server'
import { requireAppAccess } from '@/lib/appAccess'
import { getGeminiApiKey, getGeminiUrl, type GeminiPart } from '@/lib/gemini'
import { formatLocalDateString, getTodayString } from '@/lib/utils'

export const maxDuration = 30

const GEMINI_API_KEY = getGeminiApiKey()
const GEMINI_URL = getGeminiUrl()

export async function POST(req: NextRequest) {
  const accessError = requireAppAccess(req)
  if (accessError) return accessError

  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured' },
      { status: 500 }
    )
  }

  try {
    const { message, categories, chatHistory, today: clientToday } = await req.json()

    const today = typeof clientToday === 'string' ? clientToday : getTodayString()
    const now = new Date(`${today}T00:00:00`)
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const lastMonthStartStr = formatLocalDateString(lastMonthStart)
    const lastMonthEndStr = formatLocalDateString(lastMonthEnd)
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - 7)
    const weekStartStr = formatLocalDateString(weekStart)

    const categoryList = categories
      .map((c: { id: string; name: string }) => `- ${c.name}: "${c.id}"`)
      .join('\n')

    const historyBlock = chatHistory?.length > 0
      ? `Recent conversation context:
${chatHistory.map((m: { role: string; message: string }) =>
  `${m.role === 'user' ? 'User' : 'AI'}: ${m.message}`
).join('\n')}

`
      : ''

    const prompt = `You are translating a natural language spending query into a structured filter object for an expense tracker. The user may write in English, Hindi, or Hinglish in Roman script.

Today: ${today}
This month: ${monthStart} to ${today}
Last month: ${lastMonthStartStr} to ${lastMonthEndStr}
Last 7 days: ${weekStartStr} to ${today}

Available categories:
${categoryList}

${historyBlock}Translate the query into this exact JSON structure:
{
  "operation": "sum" | "count" | "list" | "average" | "max" | "budget_check",
  "filters": {
    "type": "expense" | "income" | "all",
    "categoryIds": string[] | null,
    "paymentMethods": ("upi" | "cash" | "sbi-credit-card" | "icici-credit-card" | "debit-card" | "bank-transfer" | "wallet" | "other")[] | null,
    "tags": string[] | null,
    "dateFrom": "YYYY-MM-DD" | null,
    "dateTo": "YYYY-MM-DD" | null,
    "search": string | null
  },
  "displayMode": "inline" | "navigate",
  "naturalContext": string
}

Rules:
- Understand Hinglish query words such as "kitna/kitne" = how much/how many, "dikhao" = show, "kharch hua/gaya" = spent, "is mahine" = this month, "pichle mahine" = last month, "kal" = yesterday, and "aaj" = today.
- operation "sum": total amount (how much, total spent)
- operation "count": number of entries (how many times)
- operation "list": show entries (show me, find all, list)
- operation "average": average amount (average spend)
- operation "max": biggest/highest entry
- operation "budget_check": am I over budget questions
- displayMode "navigate": use for list/find/show queries
- displayMode "inline": use for sum/count/average/max/budget_check
- naturalContext: short phrase describing the query e.g. "Food expenses this month"
- Use conversation history to resolve "last month", "that category", "and last week?" follow-ups
- categoryIds: match category names to IDs from the list above, null if no category filter
- paymentMethods: match payment words. Use "upi" for UPI/GPay/PhonePe/Paytm UPI, "sbi-credit-card" for SBI card, "icici-credit-card" for ICICI card, null if no payment filter
- If query mentions a tag like #goa-trip, put it in tags array

Examples:
- "is mahine food pe kitna kharch hua?" => sum Food expenses this month
- "kal ke travel expenses dikhao" => list Travel expenses from yesterday
- "pichle mahine dawai pe kitna gaya?" => sum Health expenses last month

Respond ONLY with valid JSON, no markdown.

Query: "${message}"`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    })
    if (!response.ok) {
      return NextResponse.json({ error: 'AI service error' }, { status: 502 })
    }

    const data = await response.json()
    const parts = (data.candidates?.[0]?.content?.parts || []) as GeminiPart[]

// pick only real response (ignore thinking)
    const text = parts.find((p) => !p.thought)?.text
    if (!text) {
      return NextResponse.json({ error: 'Empty response' }, { status: 502 })
    }

    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
