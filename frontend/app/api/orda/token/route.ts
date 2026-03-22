import { NextResponse } from 'next/server'

import {
  ORDA_JWT_PERMISSIONS,
  ORDA_TOKEN_TTL_SECONDS,
  resolveOrdaApiBaseUrl,
} from '@/lib/orda'

export const runtime = 'nodejs'

function normalizeExpiresAt(value: number | string | undefined) {
  if (typeof value === 'number') {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }

  if (typeof value === 'string') {
    const numericValue = Number(value)

    if (Number.isFinite(numericValue)) {
      return normalizeExpiresAt(numericValue)
    }

    const timestamp = Date.parse(value)

    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  return Date.now() + ORDA_TOKEN_TTL_SECONDS * 1000
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: string
      message?: string
    }

    return payload.error || payload.message || 'Orda authentication failed.'
  } catch {
    return 'Orda authentication failed.'
  }
}

export async function POST() {
  const clientId = process.env.ORDA_CLIENT_ID
  const clientSecret = process.env.ORDA_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        message: 'Orda credentials are not configured on the server.',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
        status: 500,
      },
    )
  }

  const response = await fetch(`${resolveOrdaApiBaseUrl()}/tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
    },
    body: JSON.stringify({
      expiresIn: ORDA_TOKEN_TTL_SECONDS,
      permissions: [...ORDA_JWT_PERMISSIONS],
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    return NextResponse.json(
      {
        message: await parseErrorMessage(response),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
        status: response.status,
      },
    )
  }

  const payload = (await response.json()) as {
    expiresAt?: number | string
    jwt?: string
    token?: string
  }

  const jwt = payload.jwt ?? payload.token

  if (!jwt) {
    return NextResponse.json(
      {
        message: 'Orda returned an empty JWT payload.',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
        status: 502,
      },
    )
  }

  return NextResponse.json(
    {
      jwt,
      expiresAt: normalizeExpiresAt(payload.expiresAt),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
