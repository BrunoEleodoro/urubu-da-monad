import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  clearPasskeySession,
  createBufferedCookieWriter,
  getSnapshot,
  type CookieMutation,
} from '@/lib/passkey-wallet.server'

export async function POST() {
  const mutations: CookieMutation[] = []
  clearPasskeySession(createBufferedCookieWriter(mutations))

  const response = NextResponse.json({
    ...getSnapshot(cookies()),
    connected: false,
  })
  applyMutations(response, mutations)
  return response
}

function applyMutations(response: NextResponse, mutations: CookieMutation[]) {
  for (const mutation of mutations) {
    if (mutation.type === 'delete') response.cookies.delete(mutation.name)
    else response.cookies.set(mutation.options)
  }
}
