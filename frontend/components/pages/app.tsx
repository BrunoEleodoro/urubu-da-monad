'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useFrame } from '@/components/farcaster-provider'
import { GameScreen, type WalletUiState } from '@/components/game-screen'
import { OrdaRampView, type RampMode } from '@/components/orda-ramp-sheet'
import {
  monadMainnet,
  monadTradeSimulationRecipient,
  monadUsdc,
} from '@/lib/chains'
import { erc20Abi, parseUnits } from 'viem'
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
} from 'wagmi'

function shortenAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface BrowserWalletState {
  any: boolean
  rabby: boolean
  metaMask: boolean
}

function detectBrowserWallets(): BrowserWalletState {
  if (typeof window === 'undefined') {
    return {
      any: false,
      rabby: false,
      metaMask: false,
    }
  }

  type ProviderFlags = {
    isMetaMask?: boolean
    isRabby?: boolean
  }

  type WindowWithEthereum = Window & {
    ethereum?: ProviderFlags & {
      providers?: ProviderFlags[]
    }
  }

  const ethereum = (window as WindowWithEthereum).ethereum
  const providers: ProviderFlags[] =
    ethereum?.providers && ethereum.providers.length > 0
      ? ethereum.providers
      : ethereum
        ? [ethereum]
        : []

  const rabby = providers.some((provider) => Boolean(provider.isRabby))
  const metaMask = providers.some(
    (provider) => Boolean(provider.isMetaMask) && !provider.isRabby,
  )

  return {
    any: providers.length > 0,
    rabby,
    metaMask,
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Wallet connection failed'
}

export default function App() {
  const [rampMode, setRampMode] = useState<RampMode | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [browserWallets, setBrowserWallets] = useState<BrowserWalletState>({
    any: false,
    rabby: false,
    metaMask: false,
  })
  const { isEthProviderAvailable, isLoading, isSDKLoaded } = useFrame()
  const { address, chainId, connector, isConnected } = useAccount()
  const { connectAsync, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: monadMainnet.id })

  const { data: usdcBalance } = useBalance({
    address,
    token: monadUsdc.address,
    chainId: monadMainnet.id,
    query: {
      enabled: Boolean(address && isConnected),
    },
  })

  useEffect(() => {
    const sync = () => setBrowserWallets(detectBrowserWallets())

    sync()
    const asyncInjectTimeout = window.setTimeout(sync, 400)

    window.addEventListener('ethereum#initialized', sync, { once: true })

    return () => {
      window.clearTimeout(asyncInjectTimeout)
      window.removeEventListener('ethereum#initialized', sync)
    }
  }, [])

  const connectWallet = useCallback(async () => {
    setWalletError(null)

    const candidateIds = [
      ...(isEthProviderAvailable ? ['farcaster'] : []),
      ...(browserWallets.rabby ? ['rabby'] : []),
      ...(browserWallets.metaMask ? ['metaMask'] : []),
      ...(browserWallets.any ? ['injected'] : []),
    ]

    const orderedConnectors = candidateIds
      .map((id) => connectors.find((connector) => connector.id === id))
      .filter((connector): connector is (typeof connectors)[number] =>
        Boolean(connector),
      )

    if (orderedConnectors.length === 0) {
      setWalletError('Open in Warpcast or use a browser wallet like Rabby')
      return
    }

    let lastError: unknown = null

    for (const selectedConnector of orderedConnectors) {
      try {
        await connectAsync({
          connector: selectedConnector,
          chainId: monadMainnet.id,
        })
        return
      } catch (error) {
        lastError = error
      }
    }

    setWalletError(getErrorMessage(lastError))
  }, [browserWallets.any, browserWallets.metaMask, browserWallets.rabby, connectAsync, connectors, isEthProviderAvailable])

  const switchToMonad = useCallback(async () => {
    setWalletError(null)

    try {
      await switchChainAsync({ chainId: monadMainnet.id })
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : 'Network switch failed',
      )
    }
  }, [switchChainAsync])

  const disconnectWallet = useCallback(() => {
    setWalletError(null)
    disconnect()
  }, [disconnect])

  const walletState = useMemo<WalletUiState>(() => {
    const onMonad = chainId === monadMainnet.id
    const isBusy = isConnecting || isSwitchingChain
    const hasWalletOption = isEthProviderAvailable || browserWallets.any
    const action = isConnected
      ? onMonad
        ? 'disconnect'
        : 'switch-chain'
      : 'connect'
    let status = 'Open in Warpcast or a browser wallet'

    if (walletError) {
      status = walletError
    } else if (isBusy) {
      status = 'Connecting wallet...'
    } else if (isConnected && onMonad) {
      status = `Connected with ${connector?.name ?? 'wallet'}`
    } else if (isConnected) {
      status = 'Switch to Monad Mainnet'
    } else if (browserWallets.rabby) {
      status = 'Connect your Rabby wallet'
    } else if (browserWallets.metaMask) {
      status = 'Connect your MetaMask wallet'
    } else if (browserWallets.any) {
      status = 'Connect your browser wallet'
    } else if (isEthProviderAvailable) {
      status = 'Connect your Farcaster wallet'
    } else if (isLoading) {
      status = 'Loading Farcaster client...'
    } else if (isSDKLoaded) {
      status = 'Wallet provider unavailable'
    } else if (hasWalletOption) {
      status = 'Connect your wallet'
    }

    return {
      connected: isConnected,
      connecting: isBusy,
      interactive: isConnected || hasWalletOption,
      action,
      address: address ?? '',
      addressLabel: shortenAddress(address),
      usdcBalanceLabel: usdcBalance
        ? `${Number(usdcBalance.formatted).toFixed(2)} ${usdcBalance.symbol}`
        : '',
      usdcBalanceValue: usdcBalance ? Number(usdcBalance.formatted) : null,
      chainLabel: onMonad
        ? `${connector?.name ?? 'Wallet'} on Monad Mainnet`
        : chainId
          ? `Chain ${chainId}`
          : '',
      status,
    }
  }, [
    address,
    browserWallets.any,
    browserWallets.metaMask,
    browserWallets.rabby,
    chainId,
    connector?.name,
    isEthProviderAvailable,
    isConnected,
    isConnecting,
    isLoading,
    isSDKLoaded,
    isSwitchingChain,
    usdcBalance,
    walletError,
  ])

  const simulateTradeTransfer = useCallback(async () => {
    setWalletError(null)

    if (!publicClient) {
      throw new Error('Monad public client unavailable.')
    }

    if (!address || !isConnected) {
      throw new Error('Connect your wallet first.')
    }

    if (chainId !== monadMainnet.id) {
      throw new Error('Switch to Monad Mainnet first.')
    }

    await publicClient.simulateContract({
      account: address,
      address: monadUsdc.address,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [
        monadTradeSimulationRecipient,
        parseUnits('1', monadUsdc.decimals),
      ],
    })

    return {
      amountLabel: `1.00 ${monadUsdc.symbol}`,
      receiverLabel: shortenAddress(monadTradeSimulationRecipient),
    }
  }, [address, chainId, isConnected, publicClient])

  if (rampMode) {
    return (
      <OrdaRampView
        mode={rampMode}
        onBack={() => setRampMode(null)}
      />
    )
  }

  return (
    <>
      <GameScreen
        wallet={walletState}
        onConnectWallet={connectWallet}
        onSwitchToMonad={switchToMonad}
        onDisconnectWallet={disconnectWallet}
        onOpenOffRamp={() => setRampMode('offRamp')}
        onOpenOnRamp={() => setRampMode('onRamp')}
        onSimulateTrade={simulateTradeTransfer}
      />

    </>
  )
}
