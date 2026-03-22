'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

import type { Address, Hex } from 'viem'
import { Authentication, Registration } from 'webauthx/client'

import {
  type PasskeyWalletSnapshot,
  passkeyWalletSnapshotSchema,
} from '@/lib/passkey-wallet'

const PASSKEY_SESSION_ENDPOINT = '/api/passkeys/session'

interface PasskeyTransferParams {
  amount: bigint
  recipient: Address
  tokenAddress: Address
}

interface PasskeyOpenPositionParams {
  amount: bigint
  contractAddress: Address
  isLong: boolean
  tokenAddress: Address
}

interface PasskeySettlePositionParams {
  contractAddress: Address
  positionId: bigint
}

interface PasskeyWalletContextValue extends PasskeyWalletSnapshot {
  enabled: boolean
  hasPlatformSupport: boolean
  isAuthenticating: boolean
  isDisconnecting: boolean
  isReady: boolean
  refresh: () => Promise<void>
  registerWallet: (label?: string) => Promise<void>
  authenticate: () => Promise<void>
  disconnect: () => Promise<void>
  sendTransfer: (params: PasskeyTransferParams) => Promise<Hex>
  openPosition: (
    params: PasskeyOpenPositionParams,
  ) => Promise<{ approvalHash: Hex | null; openHash: Hex }>
  settlePosition: (params: PasskeySettlePositionParams) => Promise<Hex>
}

const fallbackSnapshot: PasskeyWalletSnapshot = {
  address: null,
  connected: false,
  hasWallet: false,
  label: null,
}

const PasskeyWalletContext = createContext<PasskeyWalletContextValue | null>(
  null,
)

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return 'Falha na requisicao de passkey.'
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init)
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

export function PasskeyWalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [snapshot, setSnapshot] =
    useState<PasskeyWalletSnapshot>(fallbackSnapshot)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasPlatformSupport, setHasPlatformSupport] = useState(false)

  const refresh = useCallback(async () => {
    const nextSnapshot = passkeyWalletSnapshotSchema.parse(
      await requestJson<PasskeyWalletSnapshot>(PASSKEY_SESSION_ENDPOINT),
    )
    setSnapshot(nextSnapshot)
    setIsReady(true)
  }, [])

  useEffect(() => {
    setHasPlatformSupport(
      typeof window !== 'undefined' &&
        typeof window.PublicKeyCredential !== 'undefined',
    )

    void refresh().catch(() => {
      setSnapshot(fallbackSnapshot)
      setIsReady(true)
    })
  }, [refresh])

  const registerWallet = async (label?: string) => {
    setIsAuthenticating(true)

    try {
      const { options } = await requestJson<{
        options: unknown
      }>('/api/passkeys/register/options', {
        body: JSON.stringify({ label }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      const credential = await Registration.create({
        options: options as never,
      })
      const nextSnapshot = passkeyWalletSnapshotSchema.parse(
        await requestJson<PasskeyWalletSnapshot>(
          '/api/passkeys/register/verify',
          {
            body: JSON.stringify({ credential }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          },
        ),
      )

      setSnapshot(nextSnapshot)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    } finally {
      setIsAuthenticating(false)
      setIsReady(true)
    }
  }

  const authenticate = async () => {
    setIsAuthenticating(true)

    try {
      const { options } = await requestJson<{
        options: unknown
      }>('/api/passkeys/auth/options', {
        method: 'POST',
      })

      const response = await Authentication.sign({ options: options as never })
      const nextSnapshot = passkeyWalletSnapshotSchema.parse(
        await requestJson<PasskeyWalletSnapshot>('/api/passkeys/auth/verify', {
          body: JSON.stringify({ response }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }),
      )

      setSnapshot(nextSnapshot)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    } finally {
      setIsAuthenticating(false)
      setIsReady(true)
    }
  }

  const disconnect = async () => {
    setIsDisconnecting(true)

    try {
      const nextSnapshot = passkeyWalletSnapshotSchema.parse(
        await requestJson<PasskeyWalletSnapshot>('/api/passkeys/disconnect', {
          method: 'POST',
        }),
      )
      setSnapshot(nextSnapshot)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    } finally {
      setIsDisconnecting(false)
    }
  }

  const sendTransfer = async ({
    amount,
    recipient,
    tokenAddress,
  }: PasskeyTransferParams) => {
    await authenticate()

    const { hash } = await requestJson<{ hash: Hex }>(
      '/api/passkeys/transfer',
      {
        body: JSON.stringify({
          amount: amount.toString(),
          recipient,
          tokenAddress,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    )

    return hash
  }

  const openPosition = async ({
    amount,
    contractAddress,
    isLong,
    tokenAddress,
  }: PasskeyOpenPositionParams) => {
    await authenticate()

    return requestJson<{ approvalHash: Hex | null; openHash: Hex }>(
      '/api/passkeys/protocol',
      {
        body: JSON.stringify({
          action: 'open-position',
          amount: amount.toString(),
          contractAddress,
          isLong,
          tokenAddress,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    )
  }

  const settlePosition = async ({
    contractAddress,
    positionId,
  }: PasskeySettlePositionParams) => {
    await authenticate()

    const { hash } = await requestJson<{ hash: Hex }>(
      '/api/passkeys/protocol',
      {
        body: JSON.stringify({
          action: 'settle-position',
          contractAddress,
          positionId: positionId.toString(),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    )

    return hash
  }

  const value: PasskeyWalletContextValue = {
    ...snapshot,
    enabled: hasPlatformSupport,
    hasPlatformSupport,
    isAuthenticating,
    isDisconnecting,
    isReady,
    authenticate,
    disconnect,
    refresh,
    registerWallet,
    openPosition,
    sendTransfer,
    settlePosition,
  }

  return (
    <PasskeyWalletContext.Provider value={value}>
      {children}
    </PasskeyWalletContext.Provider>
  )
}

export function usePasskeyWallet() {
  const context = useContext(PasskeyWalletContext)
  if (!context) {
    throw new Error('PasskeyWalletProvider is missing.')
  }

  return context
}

export function usePasskeyProtocolActions() {
  const context = usePasskeyWallet()

  return {
    isSending: context.isAuthenticating,
    openPosition: context.openPosition,
    settlePosition: context.settlePosition,
  }
}
