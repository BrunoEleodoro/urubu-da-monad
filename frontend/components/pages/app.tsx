'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useFrame } from '@/components/farcaster-provider'
import { GameScreen, type WalletUiState } from '@/components/game-screen'
import {
  passkeyWalletEnabled,
  usePasskeyTradeTransfer,
  usePasskeyWallet,
} from '@/components/passkey-wallet-provider'
import { PasskeyWalletView } from '@/components/passkey-wallet-screen'
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
  useSwitchChain,
  useWriteContract,
} from 'wagmi'

type OverlayMode = RampMode | 'passkey'

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
  const [overlayMode, setOverlayMode] = useState<OverlayMode | null>(null)
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
  const { writeContractAsync } = useWriteContract()

  const passkeyWallet = usePasskeyWallet()
  const passkeyTradeTransfer = usePasskeyTradeTransfer()

  const canUsePasskey = passkeyWallet.enabled && !isEthProviderAvailable
  const passkeyConnected = canUsePasskey && passkeyWallet.connected
  const walletConnected = isConnected || passkeyConnected
  const activeAddress = isConnected
    ? address
    : passkeyConnected
      ? passkeyWallet.address
      : undefined
  const onMonad = isConnected ? chainId === monadMainnet.id : passkeyConnected

  const { data: usdcBalance } = useBalance({
    address: activeAddress,
    token: monadUsdc.address,
    chainId: monadMainnet.id,
    query: {
      enabled: Boolean(activeAddress && walletConnected),
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

  useEffect(() => {
    if (overlayMode === 'passkey' && passkeyConnected) {
      setOverlayMode(null)
    }
  }, [overlayMode, passkeyConnected])

  const connectWallet = useCallback(async () => {
    setWalletError(null)

    const candidateIds = [
      ...(isEthProviderAvailable ? ['farcaster'] : []),
      ...(browserWallets.rabby ? ['rabby'] : []),
      ...(browserWallets.metaMask ? ['metaMask'] : []),
      ...(browserWallets.any ? ['injected'] : []),
    ]

    const orderedConnectors = candidateIds
      .map((id) => connectors.find((candidateConnector) => candidateConnector.id === id))
      .filter((candidateConnector): candidateConnector is (typeof connectors)[number] =>
        Boolean(candidateConnector),
      )

    if (orderedConnectors.length === 0) {
      if (canUsePasskey) {
        setOverlayMode('passkey')
        return
      }

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
  }, [
    browserWallets.any,
    browserWallets.metaMask,
    browserWallets.rabby,
    canUsePasskey,
    connectAsync,
    connectors,
    isEthProviderAvailable,
  ])

  const switchToMonad = useCallback(async () => {
    setWalletError(null)

    if (passkeyConnected) {
      return
    }

    try {
      await switchChainAsync({ chainId: monadMainnet.id })
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : 'Network switch failed',
      )
    }
  }, [passkeyConnected, switchChainAsync])

  const disconnectWallet = useCallback(() => {
    setWalletError(null)

    if (isConnected) {
      disconnect()
      return
    }

    if (passkeyConnected) {
      passkeyWallet.disconnect()
    }
  }, [disconnect, isConnected, passkeyConnected, passkeyWallet])

  const walletState = useMemo<WalletUiState>(() => {
    const isBusy =
      isConnecting ||
      isSwitchingChain ||
      passkeyWallet.isAuthenticating ||
      passkeyWallet.isDisconnecting
    const hasWalletOption = isEthProviderAvailable || browserWallets.any || canUsePasskey
    const action = isConnected
      ? onMonad
        ? 'disconnect'
        : 'switch-chain'
      : passkeyConnected
        ? 'disconnect'
        : 'connect'

    let status = 'Open in Warpcast or a browser wallet'

    if (walletError) {
      status = walletError
    } else if (isBusy) {
      status = 'Preparing your wallet...'
    } else if (passkeyConnected) {
      status = 'Connected with passkey smart wallet'
    } else if (isConnected && onMonad) {
      status = `Connected with ${connector?.name ?? 'wallet'}`
    } else if (isConnected) {
      status = 'Switch to Monad Mainnet'
    } else if (browserWallets.any && canUsePasskey) {
      status = 'Connect a browser wallet or create a passkey wallet'
    } else if (browserWallets.rabby) {
      status = 'Connect your Rabby wallet'
    } else if (browserWallets.metaMask) {
      status = 'Connect your MetaMask wallet'
    } else if (browserWallets.any) {
      status = 'Connect your browser wallet'
    } else if (canUsePasskey) {
      status = 'Create a passkey smart wallet'
    } else if (isEthProviderAvailable) {
      status = 'Connect your Farcaster wallet'
    } else if (isLoading) {
      status = 'Loading Farcaster client...'
    } else if (isSDKLoaded) {
      status = 'Wallet provider unavailable'
    } else if (hasWalletOption) {
      status = 'Connect your wallet'
    }

    const buttonLabel = isBusy
      ? 'Connecting...'
      : walletConnected
        ? shortenAddress(activeAddress) || 'Wallet connected'
        : !browserWallets.any && canUsePasskey
          ? 'Passkey wallet'
          : hasWalletOption
            ? 'Connect wallet'
            : 'Warpcast only'

    return {
      connected: walletConnected,
      connecting: isBusy,
      interactive: walletConnected || hasWalletOption,
      action,
      buttonLabel,
      address: activeAddress ?? '',
      addressLabel: shortenAddress(activeAddress),
      usdcBalanceLabel: usdcBalance
        ? `${Number(usdcBalance.formatted).toFixed(2)} ${usdcBalance.symbol}`
        : '',
      usdcBalanceValue: usdcBalance ? Number(usdcBalance.formatted) : null,
      chainLabel: passkeyConnected
        ? 'Passkey smart wallet on Monad Mainnet'
        : onMonad
          ? `${connector?.name ?? 'Wallet'} on Monad Mainnet`
          : chainId
            ? `Chain ${chainId}`
            : '',
      status,
    }
  }, [
    activeAddress,
    browserWallets.any,
    browserWallets.metaMask,
    browserWallets.rabby,
    canUsePasskey,
    chainId,
    connector?.name,
    isConnected,
    isConnecting,
    isEthProviderAvailable,
    isLoading,
    isSDKLoaded,
    isSwitchingChain,
    onMonad,
    passkeyConnected,
    passkeyWallet.isAuthenticating,
    passkeyWallet.isDisconnecting,
    usdcBalance,
    walletConnected,
    walletError,
  ])

  const simulateTradeTransfer = useCallback(async () => {
    setWalletError(null)

    if (!activeAddress || !walletConnected) {
      throw new Error('Connect your wallet first.')
    }

    const amount = parseUnits('1', monadUsdc.decimals)

    if (passkeyConnected) {
      const hash = await passkeyTradeTransfer.sendTransfer({
        amount,
        recipient: monadTradeSimulationRecipient,
        tokenAddress: monadUsdc.address,
      })

      return {
        amountLabel: `1.00 ${monadUsdc.symbol}`,
        receiverLabel: shortenAddress(monadTradeSimulationRecipient),
        transactionLabel: shortenAddress(hash),
      }
    }

    if (chainId !== monadMainnet.id) {
      throw new Error('Switch to Monad Mainnet first.')
    }

    const hash = await writeContractAsync({
      account: activeAddress,
      address: monadUsdc.address,
      abi: erc20Abi,
      functionName: 'transfer',
      chainId: monadMainnet.id,
      args: [
        monadTradeSimulationRecipient,
        amount,
      ],
    })

    return {
      amountLabel: `1.00 ${monadUsdc.symbol}`,
      receiverLabel: shortenAddress(monadTradeSimulationRecipient),
      transactionLabel: shortenAddress(hash),
    }
  }, [
    activeAddress,
    chainId,
    passkeyConnected,
    passkeyTradeTransfer,
    walletConnected,
    writeContractAsync,
  ])

  if (overlayMode === 'passkey') {
    return (
      <PasskeyWalletView
        configured={passkeyWalletEnabled}
        onBack={() => setOverlayMode(null)}
      />
    )
  }

  if (overlayMode) {
    return (
      <OrdaRampView
        mode={overlayMode}
        defaultAddress={activeAddress}
        onBack={() => setOverlayMode(null)}
      />
    )
  }

  return (
    <GameScreen
      wallet={walletState}
      showPasskeyWalletButton={!walletConnected && canUsePasskey && browserWallets.any}
      onConnectWallet={connectWallet}
      onSwitchToMonad={switchToMonad}
      onDisconnectWallet={disconnectWallet}
      onOpenOffRamp={() => setOverlayMode('offRamp')}
      onOpenOnRamp={() => setOverlayMode('onRamp')}
      onOpenPasskeyWallet={() => setOverlayMode('passkey')}
      onSimulateTrade={simulateTradeTransfer}
    />
  )
}
