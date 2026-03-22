'use client'

import { useCallback, useEffect, useState } from 'react'

import styles from './passkey-wallet-screen.module.css'

interface PasskeyWalletViewProps {
  address: string | null
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
  address,
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
  const [walletLabel, setWalletLabel] = useState(label ?? 'Carteira Urubu')
  const [addressCopied, setAddressCopied] = useState(false)

  const title = !enabled
    ? 'Passkeys indisponiveis'
    : hasWallet
      ? connected
        ? 'Carteira com passkey conectada'
        : 'Desbloqueie sua carteira com passkey'
      : 'Crie sua carteira com passkey'

  const description = !enabled
    ? 'Este navegador nao expoe WebAuthn, entao aqui so o fluxo de carteira do Farcaster fica disponivel.'
    : hasWallet
      ? 'Essa carteira vive neste navegador dentro de urubu.money. Cada operacao pede a confirmacao da passkey antes de aprovar USDC, abrir e encerrar posicoes reais na Monad.'
      : 'Crie uma carteira no navegador protegida pela passkey do seu dispositivo. Sem extensao, sem email e sem carteiras injetadas.'

  const handleCopyAddress = useCallback(async () => {
    if (!address) return

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(address)
      setAddressCopied(true)
      return
    }

    const textArea = document.createElement('textarea')
    textArea.value = address
    textArea.setAttribute('readonly', '')
    textArea.style.position = 'absolute'
    textArea.style.left = '-9999px'
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    setAddressCopied(true)
  }, [address])

  useEffect(() => {
    if (!addressCopied) return

    const timeout = window.setTimeout(() => {
      setAddressCopied(false)
    }, 1800)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [addressCopied])

  return (
    <main className={styles.screen}>
      <section className={styles.shell} aria-labelledby="passkey-wallet-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.badge}>Carteira por passkey</span>
            <h2 id="passkey-wallet-title" className={styles.title}>
              {title}
            </h2>
            <p className={styles.description}>{description}</p>
          </div>

          <button type="button" className={styles.closeButton} onClick={onBack}>
            Voltar ao jogo
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.notice}>
            {hasWallet ? (
              <>
                <strong>{label ?? 'Carteira Urubu'}</strong>
                <span>{addressLabel ? ` ${addressLabel}` : ''}</span>
              </>
            ) : (
              'A primeira passkey criada aqui vira a carteira principal deste navegador para o app.'
            )}
          </div>

          {!enabled ? (
            <div className={styles.emptyState}>
              WebAuthn nao esta disponivel nesta sessao do navegador.
            </div>
          ) : hasWallet ? (
            <div className={styles.cardWrap}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Carteira salva</div>
                <div className={styles.cardTitle}>
                  {label ?? 'Carteira Urubu'}
                </div>
                <div className={styles.cardMeta}>
                  {addressLabel || 'Carteira Monad protegida por passkey'}
                </div>

                {address ? (
                  <div className={styles.addressBox}>
                    <div className={styles.addressBoxLabel}>
                      Endereco para receber USDC
                    </div>
                    <div className={styles.addressValue}>{address}</div>
                    <button
                      type="button"
                      className={styles.copyButton}
                      onClick={() => {
                        void handleCopyAddress()
                      }}
                    >
                      {addressCopied ? 'Endereco copiado' : 'Copiar endereco'}
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    void onUnlockWallet()
                  }}
                  disabled={busy || connected}
                >
                  {connected
                    ? 'Carteira desbloqueada'
                    : busy
                      ? 'Aguardando passkey...'
                      : 'Desbloquear com passkey'}
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
                    Desconectar
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.cardWrap}>
              <div className={styles.card}>
                <label className={styles.field} htmlFor="passkey-wallet-label">
                  Nome da carteira
                </label>
                <input
                  id="passkey-wallet-label"
                  className={styles.input}
                  value={walletLabel}
                  onChange={(event) => setWalletLabel(event.target.value)}
                  maxLength={32}
                  placeholder="Carteira Urubu"
                />

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => {
                    void onCreateWallet(walletLabel)
                  }}
                  disabled={busy}
                >
                  {busy
                    ? 'Criando carteira com passkey...'
                    : 'Criar carteira com passkey'}
                </button>

                <p className={styles.helper}>
                  Essa carteira fica vinculada ao armazenamento deste navegador.
                  Se voce limpar os dados do site, precisara criar outra.
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
