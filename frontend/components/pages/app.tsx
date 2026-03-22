'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useFrame } from '@/components/farcaster-provider'
import {
  type ActivePositionUiState,
  GameScreen,
  type ProtocolUiState,
  type WalletUiState,
} from '@/components/game-screen'
import { OrdaRampView, type RampMode } from '@/components/orda-ramp-sheet'
import {
  getInjectedProviderCandidates,
  hasPreferredInjectedProvider,
  setPreferredInjectedProvider,
} from '@/components/wallet-provider'
import { monadMainnet, monadUsdc } from '@/lib/chains'
import {
  binaryAbi,
  binaryContractAddress,
  liquidityVaultAbi,
  protocolPositionResponseSchema,
  protocolSnapshotSchema,
} from '@/lib/protocol'
import {
  type Hex,
  decodeEventLog,
  erc20Abi,
  formatUnits,
  parseUnits,
} from 'viem'
import {
  type Connector,
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'

type OverlayMode = RampMode

const POSITION_STORAGE_PREFIX = 'urubu:active-position'
const BPS_DENOMINATOR = BigInt(10_000)
const LEVERAGE = BigInt(100)

function shortenAddress(address?: string | null) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    if (error.message.includes('wallet must has at least one account')) {
      return 'Desbloqueie sua carteira e habilite pelo menos uma conta antes de conectar.'
    }

    return error.message
  }

  return error instanceof Error
    ? error.message
    : 'Falha ao conectar a carteira.'
}

function shouldTryNextInjectedProvider(error: unknown) {
  if (!error || typeof error !== 'object') return false
  if (!('message' in error) || typeof error.message !== 'string') return false

  return error.message.includes('wallet must has at least one account')
}

function formatUsdcAmount(rawValue: bigint, digits = 2) {
  return `${Number(formatUnits(rawValue, monadUsdc.decimals)).toFixed(digits)} ${monadUsdc.symbol}`
}

function floorUsdcAmount(rawValue: bigint, digits = 2) {
  const numericValue = Number(formatUnits(rawValue, monadUsdc.decimals))
  const factor = 10 ** digits
  return Math.floor(numericValue * factor) / factor
}

function formatOraclePrice(rawValue: bigint) {
  const value = Number(formatUnits(rawValue, monadUsdc.decimals))
  return `US$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })}`
}

function getPositionStorageKey(address: string) {
  return `${POSITION_STORAGE_PREFIX}:${address.toLowerCase()}`
}

function calculateStakeFromGrossAmount(grossAmount: bigint, feeBps: bigint) {
  const fee = (grossAmount * feeBps) / BPS_DENOMINATOR
  return grossAmount - fee
}

function calculateMaxGrossAmount(params: {
  feeBps: bigint
  freeAssets: bigint
  lockedAssets: bigint
  maxPayout: bigint
  maxUtilizationBps: bigint
}) {
  const { feeBps, freeAssets, lockedAssets, maxPayout, maxUtilizationBps } =
    params
  const utilizationCapacity = (freeAssets * maxUtilizationBps) / BPS_DENOMINATOR

  if (utilizationCapacity <= lockedAssets) {
    return BigInt(0)
  }

  const maxStakeByUtilization = (utilizationCapacity - lockedAssets) / LEVERAGE
  const maxStake =
    maxStakeByUtilization < maxPayout ? maxStakeByUtilization : maxPayout

  if (maxStake <= BigInt(0)) {
    return BigInt(0)
  }

  let low = BigInt(0)
  let high = maxStake * BigInt(2) + BigInt(1)

  while (low < high) {
    const mid = (low + high + BigInt(1)) / BigInt(2)

    if (calculateStakeFromGrossAmount(mid, feeBps) <= maxStake) {
      low = mid
    } else {
      high = mid - BigInt(1)
    }
  }

  return low
}

function parseBinaryEvent(
  logs: Array<{ data: Hex; topics: readonly Hex[] }>,
  eventName: 'PositionOpened' | 'PositionSettled',
) {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: binaryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })

      if (decoded.eventName === eventName) {
        return decoded
      }
    } catch {
      // Ignore unrelated logs in the receipt.
    }
  }

  return null
}

async function requestJson<T>(input: RequestInfo) {
  const response = await fetch(input, {
    cache: 'no-store',
  })
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null

  if (!response.ok) {
    throw new Error(
      payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error
        ? payload.error
        : `Erro HTTP ${response.status}`,
    )
  }

  return payload as T
}

export default function App() {
  const [overlayMode, setOverlayMode] = useState<OverlayMode | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [knownPositionId, setKnownPositionId] = useState<bigint | null>(null)
  const [recoveredForAddress, setRecoveredForAddress] = useState<string | null>(
    null,
  )
  const { isEthProviderAvailable, isLoading, isSDKLoaded } = useFrame()
  const { address, chainId, connector, isConnected } = useAccount()
  const { connectAsync, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: monadMainnet.id })
  const queryClient = useQueryClient()

  const hasInjectedProvider = hasPreferredInjectedProvider()
  const knownAddress = address
  const walletConnected = isConnected
  const activeAddress = address
  const onMonad = chainId === monadMainnet.id

  const { data: usdcBalance } = useBalance({
    address: activeAddress,
    token: monadUsdc.address,
    chainId: monadMainnet.id,
    query: {
      enabled: Boolean(activeAddress && walletConnected),
    },
  })

  const protocolSnapshotQuery = useQuery({
    queryKey: ['protocol-snapshot', knownPositionId?.toString() ?? 'none'],
    queryFn: async () => {
      const searchParams = new URLSearchParams()

      if (knownPositionId !== null) {
        searchParams.set('positionId', knownPositionId.toString())
      }

      const payload = await requestJson<unknown>(
        `/api/protocol/snapshot${searchParams.size ? `?${searchParams.toString()}` : ''}`,
      )

      return protocolSnapshotSchema.parse(payload)
    },
    refetchInterval: 8_000,
  })

  const persistKnownPositionId = useCallback(
    (nextId: bigint | null) => {
      setKnownPositionId(nextId)

      if (typeof window === 'undefined' || !activeAddress) return

      const storageKey = getPositionStorageKey(activeAddress)

      if (nextId === null) {
        window.localStorage.removeItem(storageKey)
        return
      }

      window.localStorage.setItem(storageKey, nextId.toString())
    },
    [activeAddress],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!activeAddress) {
      setKnownPositionId(null)
      return
    }

    const storedValue = window.localStorage.getItem(
      getPositionStorageKey(activeAddress),
    )

    if (storedValue && /^\d+$/.test(storedValue)) {
      setKnownPositionId(BigInt(storedValue))
      return
    }

    setKnownPositionId(null)
  }, [activeAddress])

  useEffect(() => {
    if (!walletConnected || !activeAddress || knownPositionId !== null) return

    const normalizedAddress = activeAddress.toLowerCase()

    if (recoveredForAddress === normalizedAddress) return

    let cancelled = false
    setRecoveredForAddress(normalizedAddress)

    void requestJson<unknown>(
      `/api/protocol/active-position?trader=${activeAddress}`,
    )
      .then((payload) => protocolPositionResponseSchema.parse(payload))
      .then((result) => {
        if (cancelled || !result.id) return
        persistKnownPositionId(BigInt(result.id))
      })
      .catch(() => {
        // Keep the app usable even if recovery is unavailable.
      })

    return () => {
      cancelled = true
    }
  }, [
    activeAddress,
    knownPositionId,
    persistKnownPositionId,
    recoveredForAddress,
    walletConnected,
  ])

  useEffect(() => {
    const snapshot = protocolSnapshotQuery.data

    if (!snapshot || knownPositionId === null || !snapshot.position) return

    if (
      snapshot.position.settled ||
      (activeAddress &&
        snapshot.position.trader.toLowerCase() !== activeAddress.toLowerCase())
    ) {
      persistKnownPositionId(null)
    }
  }, [
    activeAddress,
    knownPositionId,
    persistKnownPositionId,
    protocolSnapshotQuery.data,
  ])

  const connectWallet = useCallback(async () => {
    setWalletError(null)

    const injectedConnector = connectors.find(
      (candidateConnector) => candidateConnector.id === 'injected',
    )
    const farcasterConnector = connectors.find(
      (candidateConnector) => candidateConnector.id === 'farcaster',
    )

    const connectWith = async (nextConnector: Connector) => {
      await connectAsync({
        connector: nextConnector,
      })
    }

    if (hasInjectedProvider && injectedConnector) {
      const injectedProviders = getInjectedProviderCandidates()
      let lastError: unknown = null

      for (const provider of injectedProviders) {
        try {
          setPreferredInjectedProvider(provider)
          await connectWith(injectedConnector)
          return
        } catch (error) {
          lastError = error

          if (!shouldTryNextInjectedProvider(error)) {
            setWalletError(getErrorMessage(error))
            return
          }
        }
      }

      setPreferredInjectedProvider(null)

      if (lastError) {
        setWalletError(getErrorMessage(lastError))
        return
      }

      setWalletError(
        'Nenhuma carteira injetada foi encontrada neste navegador.',
      )
      return
    }

    if (isEthProviderAvailable && farcasterConnector) {
      try {
        await connectWith(farcasterConnector)
      } catch (error) {
        setWalletError(getErrorMessage(error))
      }
      return
    }

    setWalletError('Nenhuma carteira injetada foi encontrada neste navegador.')
  }, [connectAsync, connectors, hasInjectedProvider, isEthProviderAvailable])

  const switchToMonad = useCallback(async () => {
    setWalletError(null)

    try {
      await switchChainAsync({ chainId: monadMainnet.id })
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : 'Falha ao trocar de rede.',
      )
    }
  }, [switchChainAsync])

  const disconnectWallet = useCallback(async () => {
    setWalletError(null)

    if (isConnected) {
      disconnect()
    }
  }, [disconnect, isConnected])

  const activePosition = useMemo<ActivePositionUiState | null>(() => {
    const snapshot = protocolSnapshotQuery.data
    const position = snapshot?.position

    if (!position || position.settled) return null

    const stake = BigInt(position.stake)
    const payout = BigInt(position.currentPayout)
    const entryPrice = BigInt(position.entryPrice)
    const liquidationPrice = BigInt(position.liquidationPrice)
    const stakeValue = Number(formatUnits(stake, monadUsdc.decimals))
    const payoutValue = Number(formatUnits(payout, monadUsdc.decimals))
    const pnlValue = payoutValue - stakeValue

    return {
      contractPayoutLabel: formatUsdcAmount(payout),
      contractPayoutValue: payoutValue,
      direction: position.isLong ? 'up' : 'down',
      entryPrice: Number(formatUnits(entryPrice, monadUsdc.decimals)),
      id: position.id,
      liquidationPrice: Number(
        formatUnits(liquidationPrice, monadUsdc.decimals),
      ),
      openTimeMs: position.openTime * 1000,
      pnlPercent: stakeValue > 0 ? (pnlValue / stakeValue) * 100 : 0,
      pnlValue,
      settleAtMs: position.openTime * 1000 + snapshot.duration * 1000,
      stakeLabel: formatUsdcAmount(stake),
      stakeValue,
    }
  }, [protocolSnapshotQuery.data])

  const protocolState = useMemo<ProtocolUiState>(() => {
    const snapshot = protocolSnapshotQuery.data

    if (!snapshot) {
      return {
        binaryAddress: binaryContractAddress,
        durationSeconds: 120,
        error:
          protocolSnapshotQuery.error instanceof Error
            ? protocolSnapshotQuery.error.message
            : null,
        feeBps: 0,
        loading: protocolSnapshotQuery.isLoading,
        maxOpenAmountLabel: `-- ${monadUsdc.symbol}`,
        maxOpenAmountValue: 0,
        maxPayoutLabel: `-- ${monadUsdc.symbol}`,
        oracleAddress: '',
        oraclePriceLabel: '--',
        paused: false,
        utilizationLabel: '--',
        vaultAddress: '',
        vaultLockedLabel: `-- ${monadUsdc.symbol}`,
        vaultTvlLabel: `-- ${monadUsdc.symbol}`,
      }
    }

    const freeAssets = BigInt(snapshot.vaultTotalAssets)
    const lockedAssets = BigInt(snapshot.vaultLockedAssets)
    const maxOpenAmountRaw = calculateMaxGrossAmount({
      feeBps: BigInt(snapshot.feeBps),
      freeAssets,
      lockedAssets,
      maxPayout: BigInt(snapshot.maxPayout),
      maxUtilizationBps: BigInt(snapshot.maxUtilizationBps),
    })
    const maxOpenAmountValue = floorUsdcAmount(maxOpenAmountRaw)
    const totalAssets = freeAssets + lockedAssets
    const utilizationBps =
      totalAssets > BigInt(0)
        ? Number((lockedAssets * BigInt(10_000)) / totalAssets)
        : 0

    return {
      binaryAddress: snapshot.binaryAddress,
      durationSeconds: snapshot.duration,
      error:
        protocolSnapshotQuery.error instanceof Error
          ? protocolSnapshotQuery.error.message
          : null,
      feeBps: snapshot.feeBps,
      loading: protocolSnapshotQuery.isFetching && !protocolSnapshotQuery.data,
      maxOpenAmountLabel: `${maxOpenAmountValue.toFixed(2)} ${monadUsdc.symbol}`,
      maxOpenAmountValue,
      maxPayoutLabel: formatUsdcAmount(BigInt(snapshot.maxPayout)),
      oracleAddress: snapshot.oracleAddress,
      oraclePriceLabel: formatOraclePrice(BigInt(snapshot.oraclePrice)),
      paused: snapshot.paused,
      utilizationLabel: `${(utilizationBps / 100).toFixed(2)}%`,
      vaultAddress: snapshot.vaultAddress,
      vaultLockedLabel: formatUsdcAmount(lockedAssets),
      vaultTvlLabel: formatUsdcAmount(totalAssets),
    }
  }, [
    protocolSnapshotQuery.data,
    protocolSnapshotQuery.error,
    protocolSnapshotQuery.isFetching,
    protocolSnapshotQuery.isLoading,
  ])

  const walletState = useMemo<WalletUiState>(() => {
    const isBusy = isConnecting || isSwitchingChain
    const hasWalletOption = hasInjectedProvider || isEthProviderAvailable
    const action = isConnected
      ? onMonad
        ? 'disconnect'
        : 'switch-chain'
      : 'connect'

    let status = 'Use uma carteira injetada ou abra no Warpcast'

    if (walletError) {
      status = walletError
    } else if (isBusy) {
      status = 'Preparando sua carteira...'
    } else if (isConnected && onMonad) {
      status = `Conectado com ${connector?.name ?? 'carteira'}`
    } else if (isConnected) {
      status = 'Troque para a Monad Mainnet'
    } else if (hasInjectedProvider) {
      status = 'Conecte sua carteira injetada'
    } else if (isEthProviderAvailable) {
      status = 'Conecte sua carteira do Farcaster'
    } else if (isLoading) {
      status = 'Carregando cliente do Farcaster...'
    } else if (isSDKLoaded || hasWalletOption) {
      status = 'Conecte sua carteira'
    }

    const buttonLabel = isBusy
      ? 'Conectando...'
      : walletConnected
        ? shortenAddress(activeAddress) || 'Carteira conectada'
        : hasWalletOption
          ? 'Conectar carteira'
          : 'Indisponivel'

    return {
      connected: walletConnected,
      connecting: isBusy,
      interactive: walletConnected || hasWalletOption,
      action,
      buttonLabel,
      address: knownAddress ?? '',
      addressLabel: shortenAddress(knownAddress),
      usdcBalanceLabel: usdcBalance
        ? `${Number(usdcBalance.formatted).toFixed(2)} ${usdcBalance.symbol}`
        : '',
      usdcBalanceValue: usdcBalance ? Number(usdcBalance.formatted) : null,
      chainLabel: onMonad
        ? `${connector?.name ?? 'Carteira'} na Monad Mainnet`
        : chainId
          ? `Rede ${chainId}`
          : '',
      status,
    }
  }, [
    activeAddress,
    chainId,
    connector?.name,
    hasInjectedProvider,
    isConnected,
    isConnecting,
    isEthProviderAvailable,
    isLoading,
    isSDKLoaded,
    isSwitchingChain,
    knownAddress,
    onMonad,
    usdcBalance,
    walletConnected,
    walletError,
  ])

  const openProtocolTrade = useCallback(
    async ({
      amount,
      direction,
    }: { amount: number; direction: 'up' | 'down' }) => {
      if (!walletConnected || !activeAddress || !publicClient) {
        throw new Error('Conecte sua carteira primeiro.')
      }

      const grossAmount = parseUnits(amount.toFixed(2), monadUsdc.decimals)
      const [vaultAddress, feeBps, maxPayout, maxUtilizationBps] =
        await Promise.all([
          publicClient.readContract({
            address: binaryContractAddress,
            abi: binaryAbi,
            functionName: 'vault',
          }),
          publicClient.readContract({
            address: binaryContractAddress,
            abi: binaryAbi,
            functionName: 'feeBps',
          }),
          publicClient.readContract({
            address: binaryContractAddress,
            abi: binaryAbi,
            functionName: 'maxPayout',
          }),
          publicClient.readContract({
            address: binaryContractAddress,
            abi: binaryAbi,
            functionName: 'maxUtilizationBps',
          }),
        ])
      const [freeAssets, lockedAssets] = await Promise.all([
        publicClient.readContract({
          address: vaultAddress,
          abi: liquidityVaultAbi,
          functionName: 'totalAssets',
        }),
        publicClient.readContract({
          address: vaultAddress,
          abi: liquidityVaultAbi,
          functionName: 'lockedAssets',
        }),
      ])
      const maxOpenAmountRaw = calculateMaxGrossAmount({
        feeBps,
        freeAssets,
        lockedAssets,
        maxPayout,
        maxUtilizationBps,
      })
      const maxOpenAmountValue = floorUsdcAmount(maxOpenAmountRaw)

      if (maxOpenAmountRaw <= BigInt(0)) {
        throw new Error(
          'O vault nao tem capacidade livre para abrir novas posicoes agora.',
        )
      }

      if (grossAmount > maxOpenAmountRaw) {
        throw new Error(
          `Maximo atual do vault: ${maxOpenAmountValue.toFixed(2)} ${monadUsdc.symbol}.`,
        )
      }

      let approvalHash: Hex | null = null

      if (chainId !== monadMainnet.id) {
        throw new Error('Troque para a Monad Mainnet primeiro.')
      }

      const allowance = await publicClient.readContract({
        address: monadUsdc.address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [activeAddress, binaryContractAddress],
      })

      if (allowance < grossAmount) {
        approvalHash = await writeContractAsync({
          account: activeAddress,
          address: monadUsdc.address,
          abi: erc20Abi,
          functionName: 'approve',
          chainId: monadMainnet.id,
          args: [binaryContractAddress, grossAmount],
        })

        await publicClient.waitForTransactionReceipt({
          hash: approvalHash,
        })
      }

      const openHash = await writeContractAsync({
        account: activeAddress,
        address: binaryContractAddress,
        abi: binaryAbi,
        functionName: 'openPosition',
        chainId: monadMainnet.id,
        args: [direction === 'up', grossAmount],
      })

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: openHash,
      })

      const openedEvent = parseBinaryEvent(receipt.logs, 'PositionOpened')

      if (!openedEvent || openedEvent.eventName !== 'PositionOpened') {
        throw new Error(
          'Nao foi possivel identificar a posicao aberta no recibo.',
        )
      }

      const id = openedEvent.args.id
      const stake = openedEvent.args.stake

      if (typeof id !== 'bigint' || typeof stake !== 'bigint') {
        throw new Error('O recibo da transacao nao trouxe os dados da posicao.')
      }

      persistKnownPositionId(id)
      await queryClient.invalidateQueries({ queryKey: ['protocol-snapshot'] })

      return {
        amountLabel: `${amount.toFixed(2)} ${monadUsdc.symbol}`,
        approvalLabel: approvalHash ? shortenAddress(approvalHash) : null,
        positionLabel: `#${id.toString()}`,
        stakeLabel: formatUsdcAmount(stake),
        transactionLabel: shortenAddress(openHash),
      }
    },
    [
      activeAddress,
      chainId,
      publicClient,
      queryClient,
      persistKnownPositionId,
      walletConnected,
      writeContractAsync,
    ],
  )

  const settleProtocolTrade = useCallback(async () => {
    if (
      !walletConnected ||
      !activeAddress ||
      !publicClient ||
      !activePosition
    ) {
      throw new Error('Nenhuma posicao ativa foi encontrada.')
    }

    const positionId = BigInt(activePosition.id)

    if (chainId !== monadMainnet.id) {
      throw new Error('Troque para a Monad Mainnet primeiro.')
    }

    const hash = await writeContractAsync({
      account: activeAddress,
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'settle',
      chainId: monadMainnet.id,
      args: [positionId],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    const settledEvent = parseBinaryEvent(receipt.logs, 'PositionSettled')

    if (!settledEvent || settledEvent.eventName !== 'PositionSettled') {
      throw new Error('Nao foi possivel identificar a liquidacao no recibo.')
    }

    const payout = settledEvent.args.payout
    const exitPrice = settledEvent.args.exitPrice

    if (typeof payout !== 'bigint' || typeof exitPrice !== 'bigint') {
      throw new Error(
        'O recibo da transacao nao trouxe os dados do encerramento.',
      )
    }

    const payoutValue = Number(formatUnits(payout, monadUsdc.decimals))
    const pnlValue = payoutValue - activePosition.stakeValue
    const pnlPercent =
      activePosition.stakeValue > 0
        ? (pnlValue / activePosition.stakeValue) * 100
        : 0

    persistKnownPositionId(null)
    await queryClient.invalidateQueries({ queryKey: ['protocol-snapshot'] })

    return {
      exitPrice: Number(formatUnits(exitPrice, monadUsdc.decimals)),
      payoutValue,
      pnlPercent,
      pnlValue,
      tone: (pnlValue >= 0 ? 'win' : 'lose') as 'win' | 'lose',
      transactionLabel: shortenAddress(hash),
    }
  }, [
    activeAddress,
    activePosition,
    chainId,
    publicClient,
    queryClient,
    persistKnownPositionId,
    walletConnected,
    writeContractAsync,
  ])

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
      activePosition={activePosition}
      protocol={protocolState}
      wallet={walletState}
      showPasskeyWalletButton={false}
      onConnectWallet={connectWallet}
      onSwitchToMonad={switchToMonad}
      onDisconnectWallet={() => {
        void disconnectWallet()
      }}
      onOpenOffRamp={() => setOverlayMode('offRamp')}
      onOpenOnRamp={() => setOverlayMode('onRamp')}
      onOpenPasskeyWallet={async () => {}}
      onPlaceTrade={openProtocolTrade}
      onSettleTrade={settleProtocolTrade}
    />
  )
}
