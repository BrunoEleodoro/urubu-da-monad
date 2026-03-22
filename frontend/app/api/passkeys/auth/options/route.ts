import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  createBufferedCookieWriter,
  createAuthenticationOptions,
  type CookieMutation,
} from '@/lib/passkey-wallet.server'

export async function POST() {
  try {
    const mutations: CookieMutation[] = []
    const options = createAuthenticationOptions(
      cookies(),
      createBufferedCookieWriter(mutations),
    )
    const response = NextResponse.json({ options })
    applyMutations(response, mutations)
    return response
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel iniciar a autenticacao por passkey.',
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
