import { NextRequest, NextResponse } from 'next/server'
import {
  APP_ACCESS_COOKIE,
  createSessionCookieValue,
  getAccessConfig,
  getSessionCookieOptions,
  isAccessCodeValid,
} from '@/lib/appAccess'

export async function POST(req: NextRequest) {
  const config = getAccessConfig()
  if (!config) {
    return NextResponse.json(
      { error: 'APP_ACCESS_CODE is not configured' },
      { status: 500 }
    )
  }

  let body: { code?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }

  if (!isAccessCodeValid(body.code, config)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(
    APP_ACCESS_COOKIE,
    createSessionCookieValue(config),
    getSessionCookieOptions()
  )

  return response
}
