'use client'

import { FrameProvider } from '@/components/farcaster-provider'
import { PasskeyWalletProvider } from '@/components/passkey-wallet-provider'
import { WalletProvider } from '@/components/wallet-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <PasskeyWalletProvider>
        <FrameProvider>{children}</FrameProvider>
      </PasskeyWalletProvider>
    </WalletProvider>
  )
}
