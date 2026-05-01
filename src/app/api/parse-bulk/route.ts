import { NextRequest, NextResponse } from 'next/server'
import { requireAppAccess } from '@/lib/appAccess'
import { getGeminiApiKey, getGeminiUrl, type GeminiPart } from '@/lib/gemini'
import { getTodayString, getYesterdayString } from '@/lib/utils'

export const maxDuration = 30

type CorrectionLike = {
  rawInput: string
  aiOutput: { categoryIds?: string[] }
  userCorrected: { categoryIds?: string[] }
}
async function callGeminiWithRetry(
  fetchFn: () => Promise<Response>,
  retries = 3
) {
  for (let i = 0; i < retries; i++) {
    const res = await fetchFn()

    if (res.ok) return res

    if (res.status === 503) {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
      continue
    }

    return res
  }

  throw new Error('AI service unavailable after retries')
}
// Initialize outside, but DO NOT throw here
const GEMINI_API_KEY = getGeminiApiKey()
const GEMINI_URL = getGeminiUrl()

export async function POST(req: NextRequest) {
  const accessError = requireAppAccess(req)
  if (accessError) return accessError

  // 1. Safe runtime guard
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 500 })
  }

  try {
    // 2. Safe destructuring with fallbacks
    const body = await req.json()
    const {
      rawInput,
      categories = [],
      corrections = [],
      today: clientToday,
      yesterday: clientYesterday,
    } = body

    if (!rawInput || typeof rawInput !== 'string') {
      return NextResponse.json({ error: 'rawInput is required' }, { status: 400 })
    }

    const categoryList = categories
      .map((c: { id: string; name: string; emoji: string }) =>
        `- ${c.id}: ${c.emoji} ${c.name}`
      )
      .join('\n')

    const correctionsBlock =
      corrections.length > 0
        ? `Past corrections (learn from these):\n${corrections
            .map(
              (c: CorrectionLike) =>
                `- "${c.rawInput}" → AI said [${c.aiOutput.categoryIds}], user corrected to [${c.userCorrected.categoryIds}]`
            )
            .join('\n')}`
        : ''

    const today = typeof clientToday === 'string' ? clientToday : getTodayString()
    const yesterday = typeof clientYesterday === 'string' ? clientYesterday : getYesterdayString()

    // 3. Re-added JSON skeleton for strict structure
    const prompt = `You are a personal expense tracker AI for an Indian user. The user may write in English, Hindi, or Hinglish in Roman script. The user has entered MULTIPLE expenses in one message. Parse each one into a separate entry.

Available categories (use ONLY these IDs):
${categoryList}

${correctionsBlock}

Rules:
- Parse EVERY distinct expense/income mentioned
- Understand Hinglish words such as "kharch/kharcha" = spent, "pe/par/mein" = on/in, "kal" = yesterday, "aaj" = today, "dawai" = medicine, "kirana" = groceries, "bijli" = electricity, and "salary aayi/paise mile" = income.
- amount: number in INR
- type: "expense" or "income"  
- categoryIds: array of category IDs. Use the category for what was paid for; if the user paid auto/cab/bus/train/petrol to go somewhere, category should be Travel, and the destination/activity should be a tag instead of another category.
- paymentMethod: one of "upi", "cash", "sbi-credit-card", "icici-credit-card", "debit-card", "bank-transfer", "wallet", "other". Infer only when mentioned. Use "upi" for gpay/google pay/phonepe/paytm upi/bhim. Use "sbi-credit-card" for SBI card/credit card if no bank is clear. Use "icici-credit-card" for ICICI card.
- date: YYYY-MM-DD. "today" = ${today}, "yesterday" = ${yesterday}. If no date mentioned, use today.
- note: short description max 100 chars
- tags: context labels for why/where/what the spend was connected to, normalized lowercase with hyphens and no special chars. Include explicit #tags, the chosen category name, and useful context words. Example: "auto rs 100 for badminton" => categoryIds ["cat-travel"], tags ["travel","badminton"].
- confidence: "high" | "medium" | "low"

Examples:
- "chai pe 30, kal petrol 500, dawai ke liye 250" => three separate expenses
- "salary aayi 50000 aur mobile recharge 399" => one income and one expense

Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {
    "type": "expense" | "income",
    "amount": number,
    "categoryIds": string[],
    "paymentMethod": "upi" | "cash" | "sbi-credit-card" | "icici-credit-card" | "debit-card" | "bank-transfer" | "wallet" | "other",
    "date": "YYYY-MM-DD",
    "note": string,
    "tags": string[],
    "confidence": "high" | "medium" | "low"
  }
]
Input: "${rawInput}"`

    const response = await callGeminiWithRetry(() => fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
        },
      }),
    })
  )
  if (response.status === 503) {
  return NextResponse.json(
    { error: 'AI busy, try again', retry: true },
    { status: 503 }
  )
}
    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    //console.log(response.ok)
    //console.log('GEMINI RAW:', await response.text())
    const parts = (data.candidates?.[0]?.content?.parts || []) as GeminiPart[]

// find actual JSON response (ignore reasoning)
const text = parts.find((p) => !p.thought)?.text
    if (!text) {
  return NextResponse.json(
    { error: 'No response from AI' },
    { status: 500 }
  )
}

let parsed

try {
  parsed = JSON.parse(text)

  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed)
  }

  if (!Array.isArray(parsed)) {
    parsed = [parsed]
  }

  return NextResponse.json(parsed)
} catch (error) {
  console.error('Bulk JSON parse failed:', error)
  console.error('Raw extracted text:', text)

  return NextResponse.json(
    {
      error: 'Bulk JSON parse failed',
      raw: text,
    },
    { status: 500 }
  )
}
  } catch (error) {
    console.error('Unexpected error in /parse-bulk:', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
