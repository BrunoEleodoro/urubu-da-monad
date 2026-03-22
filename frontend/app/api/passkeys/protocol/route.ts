import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  openPasskeyPosition,
  settlePasskeyPosition,
} from '@/lib/passkey-wallet.server'
import { passkeyProtocolActionRequestSchema } from '@/lib/protocol'

export async function POST(request: Request) {
  try {
    const body = passkeyProtocolActionRequestSchema.parse(await request.json())

    if (body.action === 'open-position') {
      const result = await openPasskeyPosition(cookies(), {
        amount: BigInt(body.amount),
        contractAddress: body.contractAddress as `0x${string}`,
        isLong: body.isLong,
        tokenAddress: body.tokenAddress as `0x${string}`,
      })

      return NextResponse.json(result)
    }

    const hash = await settlePasskeyPosition(
      cookies(),
      body.contractAddress as `0x${string}`,
      BigInt(body.positionId),
    )

    return NextResponse.json({ hash })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel executar a acao da passkey no protocolo.',
      },
      { status: 400 },
    )
  }
}
