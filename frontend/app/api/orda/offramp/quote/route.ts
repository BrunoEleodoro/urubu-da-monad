import { NextResponse } from 'next/server'
import { parseUnits } from 'viem'
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
  fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  taxId: z.string().trim().min(11).max(18),
  pixKey: z.string().trim().min(4).max(140),
})

function normalizeTaxId(value: string) {
  return value.replace(/\D/g, '')
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json())
    const asset = getOrdaRampAsset(body.assetKey)

    if (!asset) {
      return NextResponse.json(
        {
          message: 'Unsupported off-ramp asset.',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
          status: 400,
        },
      )
    }

    const normalizedTaxId = normalizeTaxId(body.taxId)

    if (normalizedTaxId.length < 11) {
      return NextResponse.json(
        {
          message: 'Use a valid CPF or CNPJ.',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
          status: 400,
        },
      )
    }

    const quote = await getOrdaClient().offRamp.requestQuote({
      fromChain: asset.chainId,
      fromToken: asset.tokenAddress,
      fromAddress: body.fromAddress,
      intent: {
        method: 'fromAmount',
        value: parseUnits(body.amount.toFixed(asset.decimals), asset.decimals).toString(),
      },
      kycInformation: {
        taxId: normalizedTaxId,
        taxIdCountry: 'BRA',
        email: body.email,
        name: body.name,
      },
      fiatSettlementDetails: {
        toCurrency: 'BRL',
        pixKey: body.pixKey,
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
          message: error.issues[0]?.message || 'Invalid off-ramp request.',
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
        message: getOrdaErrorMessage(error, 'Unable to create the off-ramp quote.'),
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
