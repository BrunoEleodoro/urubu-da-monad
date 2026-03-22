import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  createBufferedCookieWriter,
  createRegistrationOptions,
  getSnapshot,
  type CookieMutation,
} from '@/lib/passkey-wallet.server'
import { passkeyRegisterOptionsRequestSchema } from '@/lib/passkey-wallet'

export async function POST(request: Request) {
  try {
    const snapshot = getSnapshot(cookies())
    if (snapshot.hasWallet) {
      return NextResponse.json(
        { error: 'Ja existe uma carteira com passkey neste navegador.' },
        { status: 409 },
      )
    }

    const body = passkeyRegisterOptionsRequestSchema.parse(
      await request.json().catch(() => ({})),
    )

    const mutations: CookieMutation[] = []
    const options = createRegistrationOptions(
      createBufferedCookieWriter(mutations),
      body.label,
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
            : 'Nao foi possivel iniciar o cadastro da passkey.',
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
