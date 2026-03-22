import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  getOrdaClient,
  getOrdaErrorMessage,
} from '@/lib/server/orda-client'

export const runtime = 'nodejs'

const querySchema = z.object({
  transactionId: z.string().min(1),
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const params = querySchema.parse({
      transactionId: searchParams.get('transactionId'),
    })

    const status = await getOrdaClient().onRamp.getStatus(params.transactionId)

    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          message: error.issues[0]?.message || 'Falta o ID da transacao.',
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
        message: getOrdaErrorMessage(error, 'Nao foi possivel consultar o status do deposito.'),
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
