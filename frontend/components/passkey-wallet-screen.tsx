'use client'

import { useState } from 'react'

import styles from './passkey-wallet-screen.module.css'

interface PasskeyWalletViewProps {
  addressLabel: string
  busy: boolean
  connected: boolean
  enabled: boolean
  error: string | null
  hasWallet: boolean
  label: string | null
  onBack: () => void
  onCreateWallet: (label?: string) => Promise<void>
  onDisconnectWallet: () => Promise<void>
  onUnlockWallet: () => Promise<void>
}

export function PasskeyWalletView({
  addressLabel,
  busy,
  connected,
  enabled,
  error,
  hasWallet,
  label,
  onBack,
  onCreateWallet,
  onDisconnectWallet,
  onUnlockWallet,
}: PasskeyWalletViewProps) {
  const [walletLabel, setWalletLabel] = useState(label ?? 'Urubu Money Wallet')

  const title = !enabled
    ? 'Passkeys unavailable'
    : hasWallet
      ? connected
        ? 'Passkey wallet connected'
        : 'Unlock your passkey wallet'
      : 'Create your passkey wallet'

  const description = !enabled
    ? 'This browser does not expose WebAuthn, so only Farcaster wallet connection is available here.'
    : hasWallet
      ? 'This wallet lives on this browser under urubu.money. Every trade asks for a passkey confirmation before the 1 USDC transfer is sent on Monad.'
      : 'Create a browser-only wallet protected by your device passkey. No extension, no email fallback, and no injected wallet support.'

  return (
    <main className={styles.screen}>
      <section className={styles.shell} aria-labelledby="passkey-wallet-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.badge}>Browser passkey flow</span>
            <h2 id="passkey-wallet-title" className={styles.title}>
              {title}
            </h2>
            <p className={styles.description}>{description}</p>
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
            {hasWallet ? (
              <>
                <strong>{label ?? 'Urubu Money Wallet'}</strong>
                <span>{addressLabel ? ` ${addressLabel}` : ''}</span>
              </>
            ) : (
              'The first passkey you create here becomes the only browser wallet for this app.'
            )}
          </div>

          {!enabled ? (
            <div className={styles.emptyState}>
              WebAuthn is not available in this browser session.
            </div>
          ) : hasWallet ? (
            <div className={styles.cardWrap}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Stored wallet</div>
                <div className={styles.cardTitle}>
                  {label ?? 'Urubu Money Wallet'}
                </div>
                <div className={styles.cardMeta}>
                  {addressLabel || 'Passkey-protected Monad wallet'}
                </div>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    void onUnlockWallet()
                  }}
                  disabled={busy || connected}
                >
                  {connected ? 'Wallet unlocked' : busy ? 'Waiting for passkey...' : 'Unlock with passkey'}
                </button>

                {connected ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      void onDisconnectWallet()
                    }}
                    disabled={busy}
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.cardWrap}>
              <div className={styles.card}>
                <label className={styles.field} htmlFor="passkey-wallet-label">
                  Wallet name
                </label>
                <input
                  id="passkey-wallet-label"
                  className={styles.input}
                  value={walletLabel}
                  onChange={(event) => setWalletLabel(event.target.value)}
                  maxLength={32}
                  placeholder="Urubu Money Wallet"
                />

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    void onCreateWallet(walletLabel)
                  }}
                  disabled={busy}
                >
                  {busy ? 'Creating passkey wallet...' : 'Create passkey wallet'}
                </button>

                <p className={styles.helper}>
                  This wallet is tied to this browser storage. If you clear site
                  data, you will need to create a new wallet.
                </p>
              </div>
            </div>
          )}

          {error ? <div className={styles.errorBox}>{error}</div> : null}
        </div>
      </section>
    </main>
  )
}
