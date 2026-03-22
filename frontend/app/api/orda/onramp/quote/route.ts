import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getOrdaRampAsset } from '@/lib/orda'
import {
  getOrdaClient,
  getOrdaErrorMessage,
} from '@/lib/server/orda-client'

export const runtime = 'nodejs'

const requestSchema = z.object({
  assetKey: z.string().min(1),
  amount: z.coerce.number().positive().max(1_000_000),
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
})

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json())
    const asset = getOrdaRampAsset(body.assetKey)

    if (!asset) {
      return NextResponse.json(
        {
          message: 'Ativo de deposito nao suportado.',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
          status: 400,
        },
      )
    }

    const quote = await getOrdaClient().onRamp.requestQuote({
      fromCurrency: 'BRL',
      intent: {
        method: 'fromAmount',
        value: body.amount.toFixed(2),
      },
      settlementDetails: {
        toChain: asset.chainId,
        toToken: asset.tokenAddress,
        toAddress: body.toAddress,
      },
    })

    return NextResponse.json(quote, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: error.issues[0]?.message || 'Solicitacao de deposito invalida.',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
          status: 400,
        },
      )
    }

    return NextResponse.json(
      {
        message: getOrdaErrorMessage(error, 'Nao foi possivel criar a cotacao de deposito.'),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
        status: 500,
      },
    )
  }
}
