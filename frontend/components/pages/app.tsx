'use client'

import { useCallback, useMemo, useState } from 'react'

import { useFrame } from '@/components/farcaster-provider'
import { GameScreen, type WalletUiState } from '@/components/game-screen'
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

export default function App() {
  const [walletError, setWalletError] = useState<string | null>(null)
  const { isEthProviderAvailable, isLoading, isSDKLoaded } = useFrame()
  const { address, chainId, isConnected } = useAccount()
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

  const connectWallet = useCallback(async () => {
    setWalletError(null)

    if (!isEthProviderAvailable) {
      setWalletError('Open this mini app in Warpcast to connect')
      return
    }

    const farcasterConnector =
      connectors.find((connector) => connector.id === 'farcaster') ?? connectors[0]

    if (!farcasterConnector) {
      setWalletError('Farcaster wallet connector not found')
      return
    }

    try {
      await connectAsync({
        connector: farcasterConnector,
        chainId: monadMainnet.id,
      })
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : 'Wallet connection failed',
      )
    }
  }, [connectAsync, connectors, isEthProviderAvailable])

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
    const action = isConnected
      ? onMonad
        ? 'disconnect'
        : 'switch-chain'
      : 'connect'
    const status = walletError
      ? walletError
      : isBusy
        ? 'Connecting wallet...'
        : isConnected && onMonad
          ? 'Connected to Monad Mainnet'
          : isConnected
            ? 'Switch to Monad Mainnet'
            : isEthProviderAvailable
              ? 'Connect your Farcaster wallet'
              : isLoading
                ? 'Loading Farcaster client...'
                : isSDKLoaded
                  ? 'Wallet provider unavailable'
                  : 'Open in Warpcast to connect'

    return {
      connected: isConnected,
      connecting: isBusy,
      interactive: isConnected || isEthProviderAvailable,
      action,
      address: address ?? '',
      addressLabel: shortenAddress(address),
      usdcBalanceLabel: usdcBalance
        ? `${Number(usdcBalance.formatted).toFixed(2)} ${usdcBalance.symbol}`
        : '',
      usdcBalanceValue: usdcBalance ? Number(usdcBalance.formatted) : null,
      chainLabel: onMonad ? 'Monad Mainnet' : chainId ? `Chain ${chainId}` : '',
      status,
    }
  }, [
    address,
    chainId,
    isConnected,
    isConnecting,
    isEthProviderAvailable,
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

  return (
    <GameScreen
      wallet={walletState}
      onConnectWallet={connectWallet}
      onSwitchToMonad={switchToMonad}
      onDisconnectWallet={disconnectWallet}
      onSimulateTrade={simulateTradeTransfer}
    />
  )
}
