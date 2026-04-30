import { NextResponse } from 'next/server'
import { getGeminiApiKey } from '@/lib/gemini'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    hasKey: !!getGeminiApiKey(),
    timestamp: new Date().toISOString(),
  })
}
