import { farcasterMiniApp as miniAppConnector } from '@farcaster/miniapp-wagmi-connector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { injected } from 'wagmi/connectors'
import { http, WagmiProvider, createConfig } from 'wagmi'

import { monadMainnet } from '@/lib/chains'

export const config = createConfig({
  chains: [monadMainnet],
  transports: {
    [monadMainnet.id]: http(monadMainnet.rpcUrls.default.http[0]),
  },
  connectors: [
    miniAppConnector(),
    injected({
      target: 'rabby',
      shimDisconnect: true,
      unstable_shimAsyncInject: 300,
    }),
    injected({
      target: 'metaMask',
      shimDisconnect: true,
      unstable_shimAsyncInject: 300,
    }),
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 300,
    }),
  ],
})

const queryClient = new QueryClient()

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
