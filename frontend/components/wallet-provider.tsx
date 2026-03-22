import { farcasterMiniApp as miniAppConnector } from '@farcaster/miniapp-wagmi-connector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, WagmiProvider, createConfig, injected } from 'wagmi'

import { monadMainnet } from '@/lib/chains'

export const config = createConfig({
  chains: [monadMainnet],
  transports: {
    [monadMainnet.id]: http(monadMainnet.rpcUrls.default.http[0]),
  },
  connectors: [injected(), miniAppConnector()],
})

export const queryClient = new QueryClient()

export function WalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
