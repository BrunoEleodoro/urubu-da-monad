export interface OrdaRampAsset {
  key: string
  chainId: `${number}`
  chainLabel: string
  symbol: string
  decimals: number
  tokenAddress: `0x${string}`
}

export const ORDA_RAMP_ASSETS = [
  {
    key: 'base-usdc',
    chainId: '8453',
    chainLabel: 'Base',
    symbol: 'USDC',
    decimals: 6,
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  {
    key: 'ethereum-usdc',
    chainId: '1',
    chainLabel: 'Ethereum',
    symbol: 'USDC',
    decimals: 6,
    tokenAddress: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  {
    key: 'arbitrum-usdc',
    chainId: '42161',
    chainLabel: 'Arbitrum',
    symbol: 'USDC',
    decimals: 6,
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  {
    key: 'optimism-usdc',
    chainId: '10',
    chainLabel: 'Optimism',
    symbol: 'USDC',
    decimals: 6,
    tokenAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  {
    key: 'polygon-usdc',
    chainId: '137',
    chainLabel: 'Polygon',
    symbol: 'USDC',
    decimals: 6,
    tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
] as const satisfies readonly OrdaRampAsset[]

export const ORDA_RAMP_NETWORK_LABELS = ORDA_RAMP_ASSETS.map(
  (asset) => asset.chainLabel,
)

export const ORDA_DEFAULT_ASSET_KEY = ORDA_RAMP_ASSETS[0].key

export const ORDA_STATUS_POLL_INTERVAL_MS = 8_000

export function getOrdaRampAsset(assetKey: string) {
  return ORDA_RAMP_ASSETS.find((asset) => asset.key === assetKey)
}

export function getOrdaRampAssetLabel(assetKey: string) {
  const asset = getOrdaRampAsset(assetKey)
  return asset ? `${asset.symbol} on ${asset.chainLabel}` : 'Unsupported asset'
}
