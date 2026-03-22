import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { sendUsdcTransfer } from '@/lib/passkey-wallet.server'
import { passkeyTransferRequestSchema } from '@/lib/passkey-wallet'

export async function POST(request: Request) {
  try {
    const body = passkeyTransferRequestSchema.parse(await request.json())
    const hash = await sendUsdcTransfer(
      cookies(),
      BigInt(body.amount),
      body.recipient as `0x${string}`,
      body.tokenAddress as `0x${string}`,
    )

    return NextResponse.json({ hash })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to send the Monad USDC transfer.',
      },
      { status: 400 },
    )
  }
}
