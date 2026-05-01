import { NextRequest, NextResponse } from 'next/server'
import { getAccessConfig, isAppAccessGranted } from '@/lib/appAccess'

export async function GET(req: NextRequest) {
  const configured = !!getAccessConfig()

  return NextResponse.json({
    configured,
    authenticated: configured ? isAppAccessGranted(req) : false,
  })
}
