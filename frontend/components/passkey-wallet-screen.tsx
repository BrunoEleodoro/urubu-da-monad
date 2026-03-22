'use client'

import { AuthCard } from '@account-kit/react'

import styles from './passkey-wallet-screen.module.css'

interface PasskeyWalletViewProps {
  configured: boolean
  onBack: () => void
}

export function PasskeyWalletView({
  configured,
  onBack,
}: PasskeyWalletViewProps) {
  return (
    <main className={styles.screen}>
      <section className={styles.shell} aria-labelledby="passkey-wallet-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.badge}>Browser wallet flow</span>
            <h2 id="passkey-wallet-title" className={styles.title}>
              Create a passkey wallet
            </h2>
            <p className={styles.description}>
              This browser-only flow creates a smart wallet on Monad Mainnet.
              Passkey is the first option, and email remains available as a safe
              fallback if the device cannot complete WebAuthn.
            </p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onBack}
          >
            Back to game
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.notice}>
            Rabby and other injected wallets still work. This screen is here so
            browser users can create a wallet without relying on Farcaster.
          </div>

          {configured ? (
            <div className={styles.cardWrap}>
              <AuthCard />
            </div>
          ) : (
            <div className={styles.emptyState}>
              Add <code>NEXT_PUBLIC_ALCHEMY_API_KEY</code> to enable the passkey
              smart-wallet flow.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
