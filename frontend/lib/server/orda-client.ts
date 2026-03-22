import 'server-only'

import { OrdaSDK } from '@ordanetwork/sdk'

let cachedClient: OrdaSDK | null = null

export function getOrdaClient() {
  if (cachedClient) {
    return cachedClient
  }

  const clientId = process.env.ORDA_CLIENT_ID
  const clientSecret = process.env.ORDA_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Orda credentials are not configured on the server.')
  }

  cachedClient = new OrdaSDK({
    clientId,
    clientSecret,
    debug: process.env.NODE_ENV !== 'production',
  })

  return cachedClient
}

export function getOrdaErrorMessage(
  error: unknown,
  fallback = 'Unable to reach Orda right now.',
) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
