import { NextResponse } from 'next/server'

import { getProtocolSnapshot } from '@/lib/protocol.server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawPositionId = searchParams.get('positionId')
    const positionId =
      rawPositionId && /^\d+$/.test(rawPositionId)
        ? BigInt(rawPositionId)
        : null

    const snapshot = await getProtocolSnapshot(positionId)

    return NextResponse.json(snapshot)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel carregar o snapshot do protocolo.',
      },
      { status: 400 },
    )
  }
}
