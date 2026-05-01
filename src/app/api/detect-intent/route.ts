import { NextRequest, NextResponse } from 'next/server'
import { requireAppAccess } from '@/lib/appAccess'
import { getGeminiApiKey, getGeminiUrl, type GeminiPart } from '@/lib/gemini'

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
    const { rawInput } = await req.json()

    const prompt = `Classify this expense tracker input. The user may write in English, Hindi, or Hinglish in Roman script. Reply ONLY with one of these exact strings: "single" | "bulk"

"single" = one expense or income
"bulk" = two or more distinct expenses/incomes in one message

Examples:
"spent 100 on chai" → single
"chai 30, groceries 800, auto 50" → bulk
"groceries 800 and paid 400 for badminton" → bulk
"salary received 50000" → single
"lunch 200 yesterday and chai 30 today and auto 60" → bulk
"chai pe 30 kharch" → single
"kal petrol 500 aur dawai ke liye 250" → bulk
"salary aayi 50000 aur mobile recharge 399" → bulk

Input: "${rawInput}"

Reply with only the word: single OR bulk`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
        },
      }),
    })

    if (!response.ok) {
      // Default to single on error
      return NextResponse.json({ intent: 'single' })
    }

    const data = await response.json()
    const parts = (data.candidates?.[0]?.content?.parts || []) as GeminiPart[]

// find actual JSON response (ignore reasoning)
    const text = parts.find((p) => !p.thought)?.text?.trim().toLowerCase()
    const intent = text === 'bulk' ? 'bulk' : 'single'
    return NextResponse.json({ intent })
  } catch {
    return NextResponse.json({ intent: 'single' })
  }
}
