import { NextRequest, NextResponse } from 'next/server'
import { getGeminiApiKey, getGeminiUrl, type GeminiPart } from '@/lib/gemini'
import { getTodayString, getYesterdayString } from '@/lib/utils'

export const maxDuration = 30

// Initialize outside, but DO NOT throw here
const GEMINI_API_KEY = getGeminiApiKey()
const GEMINI_URL = getGeminiUrl()
type CorrectionLike = {
  rawInput: string
  aiOutput: { categoryIds?: string[] }
  userCorrected: { categoryIds?: string[] }
}

export async function POST(req: NextRequest) {
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
    const prompt = `You are a personal expense tracker AI for an Indian user. The user may write in English, Hindi, or Hinglish in Roman script.

Available categories (use ONLY these IDs):
${categoryList}

${correctionsBlock}

Rules:
- Understand Hinglish words such as "kharch/kharcha" = spent, "pe/par/mein" = on/in, "kal" = yesterday, "aaj" = today, "dawai" = medicine, "kirana" = groceries, "bijli" = electricity, and "salary aayi/paise mile" = income.
- amount: number in INR (no commas, no ₹ symbol)
- type: "expense" or "income"
- categoryIds: array of category IDs from the list above. Use the category for what was paid for; if the user paid auto/cab/bus/train/petrol to go somewhere, category should be Travel, and the destination/activity should be a tag instead of another category.
- date: YYYY-MM-DD format. "today" = ${today}, "yesterday" = ${yesterday}
- note: short description max 100 chars
- tags: context labels for why/where/what the spend was connected to, normalized lowercase with hyphens and no special chars. Include explicit #tags, the chosen category name, and useful context words. Example: "auto rs 100 for badminton" => categoryIds ["cat-travel"], tags ["travel","badminton"].
- confidence: "high" if all fields clear, "medium" if some guessed, "low" if very unclear

Examples:
- "chai pe 30 kharch" => expense, amount 30, Food, note "chai"
- "kal petrol 500" => expense, amount 500, Travel, date ${yesterday}, note "petrol"
- "dawai ke liye 250" => expense, amount 250, Health, note "dawai"
- "salary aayi 50000" => income, amount 50000, Salary, note "salary"

Return ONLY valid JSON matching this structure exactly. No explanation. No markdown.
{
  "type": "expense" | "income",
  "amount": number,
  "categoryIds": string[],
  "date": "YYYY-MM-DD",
  "note": string,
  "tags": string[],
  "confidence": "high" | "medium" | "low"
}

Input: "${rawInput}"`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
        },
      }),
    })
    //console.log('GEMINI RAW:', await response.text())
    //console.log('Gemini response status:', response.ok)
    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    const data = await response.json()
    
    const parts = (data.candidates?.[0]?.content?.parts || []) as GeminiPart[]

// find actual JSON response (ignore reasoning)
    const text = parts.find((p) => !p.thought)?.text
    //console.log('Extracted text:', text)
    if (!text) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Invalid AI response format', raw: text }, { status: 500 })
    }

    let parsed
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'JSON parse failed', raw: text }, { status: 500 })
    }

    // 4. Validate output before returning to client
    if (!parsed.amount || !parsed.type || !parsed.categoryIds) {
      return NextResponse.json({ error: 'AI missed required fields', raw: parsed }, { status: 502 })
    }

    return NextResponse.json(parsed)

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
