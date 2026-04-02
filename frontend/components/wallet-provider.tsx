import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, WagmiProvider, createConfig, injected } from 'wagmi'

import { monadMainnet } from '@/lib/chains'

export function hasInjectedProvider() {
  if (typeof window === 'undefined') return false

  return Boolean((window as Window & { ethereum?: unknown }).ethereum)
}

export const config = createConfig({
  chains: [monadMainnet],
  multiInjectedProviderDiscovery: false,
  storage: null,
  transports: {
    [monadMainnet.id]: http(monadMainnet.rpcUrls.default.http[0]),
  },
  connectors: [
    injected({
      shimDisconnect: false,
    }),
  ],
})

export const queryClient = new QueryClient()

export function WalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
