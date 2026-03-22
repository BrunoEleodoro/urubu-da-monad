import { farcasterMiniApp as miniAppConnector } from '@farcaster/miniapp-wagmi-connector'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { EIP1193Provider } from 'viem'
import { http, WagmiProvider, createConfig, injected } from 'wagmi'

import { monadMainnet } from '@/lib/chains'

type InjectedProviderWindow = Window & {
  ethereum?: InjectedProvider
}

type InjectedProvider = {
  _events?: {
    connect?: (() => void) | undefined
  }
  _state?: {
    accounts?: string[]
    initialized?: boolean
    isConnected?: boolean
    isPermanentlyDisconnected?: boolean
    isUnlocked?: boolean
  }
  isBraveWallet?: boolean
  isCoinbaseWallet?: boolean
  isMetaMask?: boolean
  isRabby?: boolean
  providers?: Array<InjectedProvider>
  selectedAddress?: string
} & EIP1193Provider

let preferredInjectedProvider: InjectedProvider | null = null

function getInjectedProviders(window?: InjectedProviderWindow) {
  const injectedProvider = window?.ethereum as InjectedProvider | undefined

  const providers = injectedProvider?.providers

  if (Array.isArray(providers) && providers.length > 0) {
    return [...providers]
  }

  return injectedProvider ? [injectedProvider] : []
}

function rankInjectedProvider(provider: InjectedProvider) {
  if (
    typeof provider.selectedAddress === 'string' &&
    provider.selectedAddress.length > 0
  ) {
    return 0
  }

  if (provider.isMetaMask === true && provider.isBraveWallet !== true) {
    return 1
  }

  if (provider.isRabby === true) {
    return 2
  }

  if (provider.isCoinbaseWallet === true) {
    return 3
  }

  return 4
}

function getPreferredInjectedProvider(window?: InjectedProviderWindow) {
  const providers = getInjectedProviders(window).sort(
    (left, right) => rankInjectedProvider(left) - rankInjectedProvider(right),
  )

  if (providers.length === 0) {
    return undefined
  }

  if (preferredInjectedProvider) {
    const matchingProvider = providers.find(
      (provider) => provider === preferredInjectedProvider,
    )

    if (matchingProvider) {
      return matchingProvider
    }
  }

  return providers[0]
}

export function getInjectedProviderCandidates() {
  if (typeof window === 'undefined') return []

  return getInjectedProviders(window as InjectedProviderWindow).sort(
    (left, right) => rankInjectedProvider(left) - rankInjectedProvider(right),
  )
}

export function setPreferredInjectedProvider(
  nextProvider: InjectedProvider | null,
) {
  preferredInjectedProvider = nextProvider
}

export function hasPreferredInjectedProvider() {
  if (typeof window === 'undefined') return false
  return getInjectedProviderCandidates().length > 0
}

export const config = createConfig({
  chains: [monadMainnet],
  transports: {
    [monadMainnet.id]: http(monadMainnet.rpcUrls.default.http[0]),
  },
  connectors: [
    injected({
      target: {
        id: 'injected',
        name: 'Injected',
        provider(window) {
          return getPreferredInjectedProvider(
            window as InjectedProviderWindow,
          ) as never
        },
      },
    }),
    miniAppConnector(),
  ],
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
