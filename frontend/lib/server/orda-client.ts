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
    throw new Error('As credenciais da Orda nao estao configuradas no servidor.')
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
  fallback = 'Nao foi possivel falar com a Orda agora.',
) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
