import 'server-only'

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export const APP_ACCESS_COOKIE = 'expense_tracker_access'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

type AccessConfig = {
  accessCode: string
  sessionSecret: string
}

export function getAccessConfig(): AccessConfig | null {
  const accessCode = process.env.APP_ACCESS_CODE?.trim()
  if (!accessCode) return null

  return {
    accessCode,
    sessionSecret: process.env.APP_SESSION_SECRET?.trim() || accessCode,
  }
}

function signSession(expiresAt: number, secret: string) {
  return crypto
    .createHmac('sha256', secret)
    .update(String(expiresAt))
    .digest('base64url')
}

function timingSafeEqualString(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) return false
  return crypto.timingSafeEqual(aBuffer, bBuffer)
}

export function isAccessCodeValid(code: unknown, config: AccessConfig) {
  if (typeof code !== 'string') return false
  return timingSafeEqualString(code.trim(), config.accessCode)
}

export function createSessionCookieValue(config: AccessConfig) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  return `${expiresAt}.${signSession(expiresAt, config.sessionSecret)}`
}

export function isAppAccessGranted(req: NextRequest) {
  const config = getAccessConfig()
  if (!config) return false

  const cookieValue = req.cookies.get(APP_ACCESS_COOKIE)?.value
  if (!cookieValue) return false

  const [expiresAtRaw, signature] = cookieValue.split('.')
  const expiresAt = Number(expiresAtRaw)

  if (!Number.isFinite(expiresAt) || !signature) return false
  if (expiresAt <= Math.floor(Date.now() / 1000)) return false

  return timingSafeEqualString(signature, signSession(expiresAt, config.sessionSecret))
}

export function requireAppAccess(req: NextRequest) {
  if (isAppAccessGranted(req)) return null

  const status = getAccessConfig() ? 401 : 500
  const error = status === 401 ? 'Unauthorized' : 'APP_ACCESS_CODE is not configured'
  return NextResponse.json({ error }, { status })
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}
