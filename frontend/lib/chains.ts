import type { Chain } from 'viem'

export const monadMainnet = {
  id: 143,
  name: 'Monad Mainnet',
  nativeCurrency: {
    name: 'Monad',
    symbol: 'MON',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
      webSocket: ['wss://rpc.monad.xyz'],
    },
    public: {
      http: ['https://rpc.monad.xyz'],
      webSocket: ['wss://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'MonadVision',
      url: 'https://monadvision.com',
    },
    monadscan: {
      name: 'Monadscan',
      url: 'https://monadscan.com',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 0,
    },
  },
  testnet: false,
} satisfies Chain

export const monadUsdc = {
  address: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
  symbol: 'USDC',
  decimals: 6,
} as const

export const monadTradeSimulationRecipient =
  '0x1111111111111111111111111111111111111111' as const
