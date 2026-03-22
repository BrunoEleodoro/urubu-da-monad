import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { getSnapshot } from '@/lib/passkey-wallet.server'

export async function GET() {
  return NextResponse.json(getSnapshot(cookies()))
}
