'use client'

import {
  AlchemyAccountProvider,
  createConfig,
  type AlchemyAccountsConfigWithUI,
  useAccount,
  useLogout,
  useSendUserOperation,
  useSignerStatus,
  useSmartAccountClient,
} from '@account-kit/react'
import { alchemy, monadMainnet as alchemyMonadMainnet } from '@account-kit/infra'
import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem'

import { APP_URL } from '@/lib/constants'

import { queryClient } from './wallet-provider'

const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? ''

export const passkeyWalletEnabled = Boolean(alchemyApiKey)

const passkeyConfig: AlchemyAccountsConfigWithUI | null = passkeyWalletEnabled
  ? createConfig(
      {
        transport: alchemy({
          apiKey: alchemyApiKey,
        }),
        chain: alchemyMonadMainnet,
        ssr: true,
      },
      {
        uiMode: 'embedded',
        illustrationStyle: 'linear',
        auth: {
          addPasskeyOnSignup: true,
          hideSignInText: true,
          sections: [
            [{ type: 'passkey' }],
            [
              {
                type: 'email',
                buttonLabel: 'Continue with email',
                placeholder: 'you@example.com',
              },
            ],
          ],
          header: (
            <div>
              <strong>Passkey smart wallet</strong>
              <p style={{ margin: '8px 0 0', opacity: 0.8 }}>
                Create a Monad smart wallet with passkey first, with email as a safe fallback.
              </p>
            </div>
          ),
        },
        supportUrl: APP_URL,
      },
    )
  : null

export function PasskeyWalletProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!passkeyConfig) {
    return <>{children}</>
  }

  return (
    <AlchemyAccountProvider config={passkeyConfig} queryClient={queryClient}>
      {children}
    </AlchemyAccountProvider>
  )
}

export function usePasskeyWallet() {
  if (!passkeyWalletEnabled) {
    return {
      address: undefined as Address | undefined,
      connected: false,
      enabled: false,
      isAuthenticating: false,
      isDisconnecting: false,
      disconnect: () => undefined,
    }
  }

  const signerStatus = useSignerStatus()
  const { address, isLoadingAccount } = useAccount({
    type: 'LightAccount',
  })
  const { logout, isLoggingOut } = useLogout()

  return {
    address,
    connected: signerStatus.isConnected && Boolean(address),
    enabled: true,
    isAuthenticating:
      signerStatus.isAuthenticating ||
      signerStatus.isInitializing ||
      isLoadingAccount,
    isDisconnecting: isLoggingOut,
    disconnect: logout,
  }
}

interface PasskeyTransferParams {
  amount: bigint
  recipient: Address
  tokenAddress: Address
}

export function usePasskeyTradeTransfer() {
  if (!passkeyWalletEnabled) {
    return {
      isSending: false,
      sendTransfer: async (_params: PasskeyTransferParams) => {
        throw new Error('Passkey wallet is not configured.')
      },
    }
  }

  const { client } = useSmartAccountClient({
    type: 'LightAccount',
  })
  const { sendUserOperationAsync, isSendingUserOperation } = useSendUserOperation({
    client,
    waitForTxn: false,
  })

  return {
    isSending: isSendingUserOperation,
    sendTransfer: async ({
      amount,
      recipient,
      tokenAddress,
    }: PasskeyTransferParams) => {
      const result = await sendUserOperationAsync({
        uo: {
          target: tokenAddress,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [recipient, amount],
          }),
          value: BigInt(0),
        },
      })

      return result.hash as Hex
    },
  }
}
