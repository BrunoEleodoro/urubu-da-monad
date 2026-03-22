export const ORDA_JWT_PERMISSIONS = [
  'quotes:read',
  'offramp:read',
  'onramp:read',
  'transactions:read',
  'recipients:read',
  'recipients:write',
] as const

export const ORDA_TOKEN_TTL_SECONDS = 60 * 60

export const ORDA_WIDGET_NETWORKS = [
  'Ethereum',
  'Base',
  'Arbitrum',
  'Optimism',
  'Polygon',
  'Avalanche',
  'BNB Smart Chain',
  'Solana',
] as const

export function resolveOrdaApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_ORDA_API_BASE_URL ||
    process.env.ORDA_API_BASE_URL ||
    'https://api.orda.network/v1'
  )
}

export function getWalletConnectProjectId() {
  return process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? ''
}
