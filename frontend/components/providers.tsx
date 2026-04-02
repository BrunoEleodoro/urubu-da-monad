'use client'

import { WalletProvider } from '@/components/wallet-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}
