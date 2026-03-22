import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  createBufferedCookieWriter,
  verifyRegistration,
  type CookieMutation,
} from '@/lib/passkey-wallet.server'
import { passkeyRegisterVerifyRequestSchema } from '@/lib/passkey-wallet'

export async function POST(request: Request) {
  try {
    const body = passkeyRegisterVerifyRequestSchema.parse(await request.json())
    const mutations: CookieMutation[] = []
    const snapshot = verifyRegistration(
      cookies(),
      createBufferedCookieWriter(mutations),
      body.credential,
    )
    const response = NextResponse.json(snapshot)
    applyMutations(response, mutations)
    return response
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Nao foi possivel verificar a passkey.',
      },
      { status: 400 },
    )
  }
}

function applyMutations(response: NextResponse, mutations: CookieMutation[]) {
  for (const mutation of mutations) {
    if (mutation.type === 'delete') response.cookies.delete(mutation.name)
    else response.cookies.set(mutation.options)
  }
}
