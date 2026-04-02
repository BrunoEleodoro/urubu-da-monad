import { NextResponse } from 'next/server'

import { recoverRecentActivePositionId } from '@/lib/protocol.server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const trader = searchParams.get('trader')

    if (!trader) {
      return NextResponse.json({ id: null })
    }

    const id = await recoverRecentActivePositionId(trader)

    return NextResponse.json({
      id: id ? id.toString() : null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel recuperar a posicao ativa.',
      },
      { status: 400 },
    )
  }
}
