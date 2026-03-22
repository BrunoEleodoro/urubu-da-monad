'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useFrame } from '@/components/farcaster-provider'
import { useAccount, useBalance, useConnect, useDisconnect } from 'wagmi'
import { monadTestnet } from 'wagmi/chains'

const GAME_SRC = '/game/index.html'

function shortenAddress(address?: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export default function Home() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [walletError, setWalletError] = useState<string | null>(null)
  const { isEthProviderAvailable, isLoading, isSDKLoaded } = useFrame()
  const { address, chainId, isConnected } = useAccount()
  const { connectAsync, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: walletBalance } = useBalance({
    address,
    chainId,
    query: {
      enabled: Boolean(address && isConnected),
    },
  })

  const walletState = useMemo(() => {
    const onMonad = chainId === monadTestnet.id
    const status = walletError
      ? walletError
      : isConnecting
        ? 'Connecting wallet...'
        : isConnected && onMonad
          ? 'Connected to Monad Testnet'
          : isConnected
            ? `Connected on chain ${chainId}`
            : isEthProviderAvailable
              ? 'Connect your Farcaster wallet'
              : isLoading
                ? 'Loading Farcaster client...'
                : isSDKLoaded
                  ? 'Wallet provider unavailable'
                  : 'Open in Warpcast to connect'

    return {
      type: 'wallet:update',
      connected: isConnected,
      connecting: isConnecting,
      interactive: isConnected || isEthProviderAvailable,
      address: address ?? '',
      addressLabel: shortenAddress(address),
      balanceLabel: walletBalance
        ? `${Number(walletBalance.formatted).toFixed(4)} ${walletBalance.symbol}`
        : '',
      chainLabel: onMonad ? 'Monad Testnet' : chainId ? `Chain ${chainId}` : '',
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
    walletBalance,
    walletError,
  ])

  const postWalletState = useCallback(() => {
    if (typeof window === 'undefined') return
    iframeRef.current?.contentWindow?.postMessage(walletState, window.location.origin)
  }, [walletState])

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
        chainId: monadTestnet.id,
      })
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : 'Wallet connection failed',
      )
    }
  }, [connectAsync, connectors, isEthProviderAvailable])

  useEffect(() => {
    postWalletState()
  }, [postWalletState])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      const payload = event.data
      if (!payload || typeof payload !== 'object') return

      if (payload.type === 'wallet:request-state') {
        postWalletState()
      }

      if (payload.type === 'wallet:connect') {
        void connectWallet()
      }

      if (payload.type === 'wallet:disconnect') {
        setWalletError(null)
        disconnect()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [connectWallet, disconnect, postWalletState])

  return (
    <main
      className="min-h-[100dvh] bg-[#0e0e1a]"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 0px)',
        paddingRight: 'max(env(safe-area-inset-right), 0px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
        paddingLeft: 'max(env(safe-area-inset-left), 0px)',
      }}
    >
      <iframe
        ref={iframeRef}
        title="Urubu do Nomad"
        src={GAME_SRC}
        className="block h-[100dvh] w-full border-0"
        onLoad={postWalletState}
        style={{
          height:
            'calc(100dvh - max(env(safe-area-inset-top), 0px) - max(env(safe-area-inset-bottom), 0px))',
        }}
      />
    </main>
  )
}
