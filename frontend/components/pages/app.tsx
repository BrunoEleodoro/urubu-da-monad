'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useFrame } from '@/components/farcaster-provider'
import { GameScreen, type WalletUiState } from '@/components/game-screen'
import {
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

function shortenAddress(address?: string | null) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Wallet connection failed'
}

export default function App() {
  const [overlayMode, setOverlayMode] = useState<OverlayMode | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)
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
      ? (passkeyWallet.address as `0x${string}` | null) ?? undefined
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
    if (overlayMode === 'passkey' && passkeyConnected) {
      setOverlayMode(null)
    }
  }, [overlayMode, passkeyConnected])

  const openPasskeyWallet = useCallback(() => {
    setWalletError(null)
    setOverlayMode('passkey')
  }, [])

  const connectWallet = useCallback(async () => {
    setWalletError(null)

    if (isEthProviderAvailable) {
      const farcasterConnector = connectors.find(
        (candidateConnector) => candidateConnector.id === 'farcaster',
      )

      if (!farcasterConnector) {
        setWalletError('Farcaster wallet connector unavailable.')
        return
      }

      try {
        await connectAsync({
          connector: farcasterConnector,
          chainId: monadMainnet.id,
        })
        return
      } catch (error) {
        setWalletError(getErrorMessage(error))
        return
      }
    }

    if (canUsePasskey) {
      openPasskeyWallet()
      return
    }

    setWalletError('Passkeys are not available in this browser.')
  }, [canUsePasskey, connectAsync, connectors, isEthProviderAvailable, openPasskeyWallet])

  const switchToMonad = useCallback(async () => {
    setWalletError(null)

    if (passkeyConnected) return

    try {
      await switchChainAsync({ chainId: monadMainnet.id })
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : 'Network switch failed',
      )
    }
  }, [passkeyConnected, switchChainAsync])

  const disconnectWallet = useCallback(async () => {
    setWalletError(null)

    if (isConnected) {
      disconnect()
      return
    }

    if (passkeyWallet.connected) {
      try {
        await passkeyWallet.disconnect()
      } catch (error) {
        setWalletError(getErrorMessage(error))
      }
    }
  }, [disconnect, isConnected, passkeyWallet])

  const createPasskeyWallet = useCallback(
    async (label?: string) => {
      setWalletError(null)

      try {
        await passkeyWallet.registerWallet(label)
        setOverlayMode(null)
      } catch (error) {
        setWalletError(getErrorMessage(error))
      }
    },
    [passkeyWallet],
  )

  const unlockPasskeyWallet = useCallback(async () => {
    setWalletError(null)

    try {
      await passkeyWallet.authenticate()
      setOverlayMode(null)
    } catch (error) {
      setWalletError(getErrorMessage(error))
    }
  }, [passkeyWallet])

  const disconnectPasskeyWallet = useCallback(async () => {
    setWalletError(null)

    try {
      await passkeyWallet.disconnect()
    } catch (error) {
      setWalletError(getErrorMessage(error))
    }
  }, [passkeyWallet])

  const walletState = useMemo<WalletUiState>(() => {
    const isBusy =
      isConnecting ||
      isSwitchingChain ||
      passkeyWallet.isAuthenticating ||
      passkeyWallet.isDisconnecting
    const hasWalletOption = isEthProviderAvailable || canUsePasskey
    const action = isConnected
      ? onMonad
        ? 'disconnect'
        : 'switch-chain'
      : passkeyConnected
        ? 'disconnect'
        : 'connect'

    let status = 'Open in Warpcast or use a passkey wallet'

    if (walletError) {
      status = walletError
    } else if (isBusy) {
      status = 'Preparing your wallet...'
    } else if (passkeyConnected) {
      status = 'Connected with passkey wallet'
    } else if (isConnected && onMonad) {
      status = `Connected with ${connector?.name ?? 'wallet'}`
    } else if (isConnected) {
      status = 'Switch to Monad Mainnet'
    } else if (canUsePasskey && passkeyWallet.hasWallet) {
      status = 'Unlock your passkey wallet'
    } else if (canUsePasskey) {
      status = 'Create your passkey wallet'
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
        : canUsePasskey
          ? passkeyWallet.hasWallet
            ? 'Unlock wallet'
            : 'Create wallet'
          : hasWalletOption
            ? 'Connect wallet'
            : 'Unavailable'

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
        ? 'Passkey wallet on Monad Mainnet'
        : onMonad
          ? `${connector?.name ?? 'Wallet'} on Monad Mainnet`
          : chainId
            ? `Chain ${chainId}`
            : '',
      status,
    }
  }, [
    activeAddress,
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
    passkeyWallet.connected,
    passkeyWallet.hasWallet,
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
      args: [monadTradeSimulationRecipient, amount],
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
        addressLabel={shortenAddress(passkeyWallet.address)}
        busy={passkeyWallet.isAuthenticating || passkeyWallet.isDisconnecting}
        connected={passkeyWallet.connected}
        enabled={passkeyWallet.enabled}
        error={walletError}
        hasWallet={passkeyWallet.hasWallet}
        label={passkeyWallet.label}
        onBack={() => setOverlayMode(null)}
        onCreateWallet={createPasskeyWallet}
        onDisconnectWallet={disconnectPasskeyWallet}
        onUnlockWallet={unlockPasskeyWallet}
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
      showPasskeyWalletButton={false}
      onConnectWallet={connectWallet}
      onSwitchToMonad={switchToMonad}
      onDisconnectWallet={() => {
        void disconnectWallet()
      }}
      onOpenOffRamp={() => setOverlayMode('offRamp')}
      onOpenOnRamp={() => setOverlayMode('onRamp')}
      onOpenPasskeyWallet={openPasskeyWallet}
      onSimulateTrade={simulateTradeTransfer}
    />
  )
}
