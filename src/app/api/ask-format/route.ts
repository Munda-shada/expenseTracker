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
    const { question, result, naturalContext, chatHistory } = await req.json()

    const historyBlock = chatHistory?.length > 0
      ? `Recent conversation:
${chatHistory.map((m: { role: string; message: string }) =>
  `${m.role === 'user' ? 'User' : 'AI'}: ${m.message}`
).join('\n')}

`
      : ''

    const prompt = `You are a friendly expense tracker assistant. Format a query result into a useful, detailed response.

${historyBlock}Question: "${question}"
Context: ${naturalContext}
Result data: ${JSON.stringify(result)}

Rules:
- Give a fuller breakdown, usually 3-6 short sentences or compact bullets when that is easier to scan.
- Start with the direct answer in the first sentence.
- Include total, count, date range, category/tag/search context, and budget status when the result data provides it.
- For list or biggest-entry results, mention notable entries from the provided result data when available.
- Add one helpful observation or next-step style insight when it follows directly from the data.
- Reply in English by default. If the user asks in Hinglish, you may answer in simple Hinglish while keeping amounts and category names clear.
- Use ₹ for amounts, Indian number formatting
- If result is empty/zero, say so helpfully
- Reference conversation history for context if relevant
- Never do math yourself — the numbers in result data are already computed
- Do not invent trends, averages, categories, dates, or entries that are not present in result data.
- Sound like a helpful friend, not a robot

Examples:
- "You've spent ₹1,400 on Badminton this month across 4 entries. The spend is concentrated in a few sessions, so it looks like a recurring activity rather than a one-off. You can tap View details to inspect each entry."
- "Your biggest expense this week was ₹2,500 on Groceries on Monday. It stands out as the highest single entry in the matched results. If this was planned shopping, your weekly pattern still looks easy to review from the details."
- "No food expenses were found for last month. That may mean nothing was logged under Food, or those entries were saved under another category. Try checking all expenses for the same date range if this feels off."
- "You're at ₹3,200 of your ₹5,000 food budget — 64% used. You still have ₹1,800 left in that budget based on the computed result. Keep an eye on larger food entries for the rest of the month."

Reply with ONLY the formatted message, no quotes, no explanation.`

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'text/plain',
          maxOutputTokens: 2048,
        },
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'AI service error' }, { status: 502 })
    }

    const data = await response.json()
    const parts = (data.candidates?.[0]?.content?.parts || []) as GeminiPart[]

// pick only real response (ignore thinking)
const text = parts.find((p) => !p.thought)?.text?.trim()
    
    return NextResponse.json({ message: text ?? 'Could not format result.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
