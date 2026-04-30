import { NextRequest, NextResponse } from 'next/server'
import { getGeminiApiKey, getGeminiUrl, type GeminiPart } from '@/lib/gemini'

export const maxDuration = 30

const GEMINI_API_KEY = getGeminiApiKey()
const GEMINI_URL = getGeminiUrl()

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured' },
      { status: 500 }
    )
  }

  try {
    const { message, chatHistory } = await req.json()

    const historyBlock = chatHistory?.length > 0
      ? `Recent conversation:
${chatHistory.map((m: { role: string; message: string }) =>
  `${m.role === 'user' ? 'User' : 'AI'}: ${m.message}`
).join('\n')}

`
      : ''

    const prompt = `You are classifying a message in a personal expense tracker app. The user may write in English, Hindi, or Hinglish in Roman script.

${historyBlock}Classify the user's latest message into exactly one of these intents:
- "query" = asking about their spending data (how much, show me, what did I spend, am I over budget, biggest expense, etc.)
- "log" = trying to log an expense or income (spent X on Y, bought Z, received salary, etc.)
- "unclear" = could be either, or completely unrelated

Examples:
"how much on food this month?" → query
"show me all expenses from last week" → query
"am I over my food budget?" → query
"biggest expense this week?" → query
"spent 200 on groceries" → log
"chai 30" → log
"chai pe 30 kharch" → log
"kal petrol 500" → log
"salary aayi 50000" → log
"salary received 50000" → log
"is mahine food pe kitna gaya?" → query
"kal ke travel expenses dikhao" → query
"badminton" → unclear (could be logging or querying)
"food" → unclear
"hello" → unclear

User message: "${message}"

Reply ONLY with one word: query, log, or unclear`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ intent: 'unclear' })
    }

    const data = await response.json()
    const parts = (data.candidates?.[0]?.content?.parts || []) as GeminiPart[]

// pick only real response (ignore thinking)
    const text = parts.find((p) => !p.thought)?.text
      ?.trim()
      .toLowerCase()

    const intent = text && ['query', 'log', 'unclear'].includes(text)
      ? text
      : 'unclear'

    return NextResponse.json({ intent })
  } catch {
    return NextResponse.json({ intent: 'unclear' })
  }
}
