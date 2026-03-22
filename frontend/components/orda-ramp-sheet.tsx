'use client'

import type {
  OffRampQuoteResponse,
  OffRampStatusResponse,
  OnRampQuoteResponse,
  OnRampStatusResponse,
} from '@ordanetwork/sdk'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'

import {
  ORDA_DEFAULT_ASSET_KEY,
  ORDA_RAMP_ASSETS,
  ORDA_RAMP_NETWORK_LABELS,
  ORDA_STATUS_POLL_INTERVAL_MS,
  getOrdaRampAsset,
  getOrdaRampAssetLabel,
} from '@/lib/orda'

import styles from './orda-ramp-sheet.module.css'

export type RampMode = 'onRamp' | 'offRamp'

interface OrdaRampViewProps {
  mode: RampMode
  onBack: () => void
  defaultAddress?: string
}

interface OnRampFormState {
  assetKey: string
  amount: string
  toAddress: string
}

interface OffRampFormState {
  assetKey: string
  amount: string
  fromAddress: string
  name: string
  email: string
  taxId: string
  pixKey: string
}

function cn(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

function formatCurrency(value: number | string, currency: string) {
  const numericValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numericValue)) {
    return `${value} ${currency}`
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue)
}

function formatTokenAmount(value: string, symbol: string) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return `${value} ${symbol}`
  }

  return `${numericValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${symbol}`
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'A few minutes'
  }

  if (seconds < 60) {
    return `${Math.round(seconds)} sec`
  }

  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return 'Waiting for update'

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Waiting for update'
  }

  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

async function getJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    cache: 'no-store',
    ...init,
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string
      }
    | T
    | null

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : 'Unable to complete this request.'

    throw new Error(
      message,
    )
  }

  return payload as T
}

export function OrdaRampView({
  mode,
  onBack,
  defaultAddress,
}: OrdaRampViewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrCodeSrc, setQrCodeSrc] = useState<string | null>(null)
  const [onRampQuote, setOnRampQuote] = useState<OnRampQuoteResponse | null>(null)
  const [onRampStatus, setOnRampStatus] = useState<OnRampStatusResponse | null>(
    null,
  )
  const [offRampQuote, setOffRampQuote] =
    useState<OffRampQuoteResponse | null>(null)
  const [offRampStatus, setOffRampStatus] =
    useState<OffRampStatusResponse | null>(null)
  const [onRampForm, setOnRampForm] = useState<OnRampFormState>({
    assetKey: ORDA_DEFAULT_ASSET_KEY,
    amount: '100.00',
    toAddress: defaultAddress ?? '',
  })
  const [offRampForm, setOffRampForm] = useState<OffRampFormState>({
    assetKey: ORDA_DEFAULT_ASSET_KEY,
    amount: '100.00',
    fromAddress: defaultAddress ?? '',
    name: '',
    email: '',
    taxId: '',
    pixKey: '',
  })

  const isOnRamp = mode === 'onRamp'
  const title = isOnRamp ? 'On-ramp' : 'Off-ramp'
  const description = isOnRamp
    ? 'Generate PIX instructions with the Orda SDK and receive USDC on a supported EVM network.'
    : 'Generate a BRL cash-out quote with the Orda SDK and receive the payout through PIX.'
  const note = isOnRamp
    ? 'Monad is still marked as in progress in Orda coverage, so this flow settles on supported EVM networks while the game itself stays Monad-only.'
    : 'Use the same EVM address format you already control. The game stays on Monad, but Orda off-ramp settlement happens on supported EVM networks.'

  const onRampAsset = useMemo(
    () => getOrdaRampAsset(onRampForm.assetKey),
    [onRampForm.assetKey],
  )
  const offRampAsset = useMemo(
    () => getOrdaRampAsset(offRampForm.assetKey),
    [offRampForm.assetKey],
  )
  const offRampApprovalTarget =
    offRampQuote?.approvalTxParams &&
    'to' in offRampQuote.approvalTxParams &&
    typeof offRampQuote.approvalTxParams.to === 'string'
      ? offRampQuote.approvalTxParams.to
      : null
  const offRampDepositTarget =
    offRampQuote?.transactionRequest &&
    'to' in offRampQuote.transactionRequest &&
    typeof offRampQuote.transactionRequest.to === 'string'
      ? offRampQuote.transactionRequest.to
      : null

  useEffect(() => {
    if (!defaultAddress) return

    setOnRampForm((current) =>
      current.toAddress ? current : { ...current, toAddress: defaultAddress },
    )
    setOffRampForm((current) =>
      current.fromAddress
        ? current
        : { ...current, fromAddress: defaultAddress },
    )
  }, [defaultAddress])

  useEffect(() => {
    let active = true

    async function createQrCode() {
      if (!onRampQuote?.depositInstructions?.pixKey) {
        setQrCodeSrc(null)
        return
      }

      if (onRampQuote.depositInstructions.pixQrCode) {
        setQrCodeSrc(
          `data:image/png;base64,${onRampQuote.depositInstructions.pixQrCode}`,
        )
        return
      }

      try {
        const dataUrl = await QRCode.toDataURL(onRampQuote.depositInstructions.pixKey, {
          margin: 1,
          width: 280,
        })

        if (active) {
          setQrCodeSrc(dataUrl)
        }
      } catch {
        if (active) {
          setQrCodeSrc(null)
        }
      }
    }

    void createQrCode()

    return () => {
      active = false
    }
  }, [onRampQuote])

  useEffect(() => {
    if (!isOnRamp || !onRampQuote?.transactionId) {
      return
    }

    let cancelled = false

    const fetchStatus = async () => {
      try {
        const nextStatus = await getJson<OnRampStatusResponse>(
          `/api/orda/onramp/status?transactionId=${encodeURIComponent(onRampQuote.transactionId)}`,
        )

        if (!cancelled) {
          setOnRampStatus(nextStatus)
        }
      } catch {
        // Keep the last known quote visible. Polling can recover on the next tick.
      }
    }

    void fetchStatus()
    const intervalId = window.setInterval(fetchStatus, ORDA_STATUS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isOnRamp, onRampQuote?.transactionId])

  useEffect(() => {
    if (isOnRamp || !offRampQuote?.transactionId) {
      return
    }

    let cancelled = false

    const fetchStatus = async () => {
      try {
        const nextStatus = await getJson<OffRampStatusResponse>(
          `/api/orda/offramp/status?transactionId=${encodeURIComponent(offRampQuote.transactionId)}`,
        )

        if (!cancelled) {
          setOffRampStatus(nextStatus)
        }
      } catch {
        // Keep the last known quote visible. Polling can recover on the next tick.
      }
    }

    void fetchStatus()
    const intervalId = window.setInterval(fetchStatus, ORDA_STATUS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isOnRamp, offRampQuote?.transactionId])

  const handleOnRampChange = <K extends keyof OnRampFormState>(
    field: K,
    value: OnRampFormState[K],
  ) => {
    setOnRampForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleOffRampChange = <K extends keyof OffRampFormState>(
    field: K,
    value: OffRampFormState[K],
  ) => {
    setOffRampForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const submitOnRamp = async () => {
    setLoading(true)
    setError(null)
    setOnRampStatus(null)

    try {
      const quote = await getJson<OnRampQuoteResponse>('/api/orda/onramp/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(onRampForm),
      })

      setOnRampQuote(quote)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create the on-ramp quote.')
    } finally {
      setLoading(false)
    }
  }

  const submitOffRamp = async () => {
    setLoading(true)
    setError(null)
    setOffRampStatus(null)

    try {
      const quote = await getJson<OffRampQuoteResponse>(
        '/api/orda/offramp/quote',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(offRampForm),
        },
      )

      setOffRampQuote(quote)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to create the off-ramp quote.')
    } finally {
      setLoading(false)
    }
  }

  const resultTitle = isOnRamp ? 'PIX instructions' : 'Cash-out quote'
  const resultHint = isOnRamp
    ? 'The PIX code below comes directly from your latest Orda on-ramp quote.'
    : 'This quote comes directly from Orda. Send the source asset only if you want to continue with the payout.'

  return (
    <main className={styles.screen}>
      <section className={styles.shell} aria-labelledby="orda-ramp-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.badge}>Powered by Orda SDK</span>
            <h2 id="orda-ramp-title" className={styles.title}>
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
          <div className={styles.notice}>{note}</div>

          <div className={styles.supportedNetworks}>
            Supported EVM routes today: {ORDA_RAMP_NETWORK_LABELS.join(', ')}.
          </div>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelEyebrow}>
                    {isOnRamp ? 'BRL to crypto' : 'Crypto to BRL'}
                  </div>
                  <h3 className={styles.panelTitle}>
                    {isOnRamp ? 'Create a PIX deposit' : 'Create a PIX cash-out'}
                  </h3>
                </div>
                <span className={styles.panelMeta}>
                  {isOnRamp
                    ? getOrdaRampAssetLabel(onRampForm.assetKey)
                    : getOrdaRampAssetLabel(offRampForm.assetKey)}
                </span>
              </div>

              {error ? (
                <div className={cn(styles.message, styles.messageError)}>
                  {error}
                </div>
              ) : null}

              {isOnRamp ? (
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Destination asset</span>
                    <select
                      value={onRampForm.assetKey}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOnRampChange('assetKey', event.currentTarget.value)
                      }
                    >
                      {ORDA_RAMP_ASSETS.map((asset) => (
                        <option key={asset.key} value={asset.key}>
                          {asset.symbol} on {asset.chainLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>BRL amount</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="0.01"
                      value={onRampForm.amount}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOnRampChange('amount', event.currentTarget.value)
                      }
                    />
                  </label>

                  <label className={cn(styles.field, styles.fieldWide)}>
                    <span className={styles.fieldLabel}>
                      Destination address
                    </span>
                    <input
                      type="text"
                      value={onRampForm.toAddress}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOnRampChange('toAddress', event.currentTarget.value)
                      }
                      placeholder="0x..."
                    />
                  </label>

                  <button
                    type="button"
                    className={styles.submitButton}
                    onClick={() => {
                      void submitOnRamp()
                    }}
                    disabled={loading || !onRampAsset}
                  >
                    {loading ? 'Generating quote...' : 'Generate PIX instructions'}
                  </button>
                </div>
              ) : (
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Source asset</span>
                    <select
                      value={offRampForm.assetKey}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOffRampChange('assetKey', event.currentTarget.value)
                      }
                    >
                      {ORDA_RAMP_ASSETS.map((asset) => (
                        <option key={asset.key} value={asset.key}>
                          {asset.symbol} on {asset.chainLabel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Token amount</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="0.01"
                      value={offRampForm.amount}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOffRampChange('amount', event.currentTarget.value)
                      }
                    />
                  </label>

                  <label className={cn(styles.field, styles.fieldWide)}>
                    <span className={styles.fieldLabel}>Source address</span>
                    <input
                      type="text"
                      value={offRampForm.fromAddress}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOffRampChange(
                          'fromAddress',
                          event.currentTarget.value,
                        )
                      }
                      placeholder="0x..."
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Full name</span>
                    <input
                      type="text"
                      value={offRampForm.name}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOffRampChange('name', event.currentTarget.value)
                      }
                      placeholder="Seu nome completo"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Email</span>
                    <input
                      type="email"
                      value={offRampForm.email}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOffRampChange('email', event.currentTarget.value)
                      }
                      placeholder="voce@exemplo.com"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>CPF or CNPJ</span>
                    <input
                      type="text"
                      value={offRampForm.taxId}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOffRampChange('taxId', event.currentTarget.value)
                      }
                      placeholder="000.000.000-00"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>PIX key</span>
                    <input
                      type="text"
                      value={offRampForm.pixKey}
                      className={styles.fieldControl}
                      onChange={(event) =>
                        handleOffRampChange('pixKey', event.currentTarget.value)
                      }
                      placeholder="email, celular, CPF, EVP..."
                    />
                  </label>

                  <button
                    type="button"
                    className={styles.submitButton}
                    onClick={() => {
                      void submitOffRamp()
                    }}
                    disabled={loading || !offRampAsset}
                  >
                    {loading ? 'Generating quote...' : 'Generate cash-out quote'}
                  </button>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelEyebrow}>Latest result</div>
                  <h3 className={styles.panelTitle}>{resultTitle}</h3>
                </div>
                <span className={styles.panelMeta}>Live SDK response</span>
              </div>

              <p className={styles.resultHint}>{resultHint}</p>

              {isOnRamp && onRampQuote ? (
                <div className={styles.resultStack}>
                  <div className={styles.heroCard}>
                    <div>
                      <span className={styles.heroLabel}>Pay via PIX</span>
                      <div className={styles.heroAmount}>
                        {formatCurrency(
                          onRampQuote.depositInstructions.amount,
                          onRampQuote.depositInstructions.currency,
                        )}
                      </div>
                      <div className={styles.heroSub}>
                        {formatTokenAmount(
                          onRampQuote.quote.toAmount,
                          onRampAsset?.symbol ?? 'USDC',
                        )}{' '}
                        to {onRampAsset?.chainLabel ?? 'network'}
                      </div>
                    </div>

                    {qrCodeSrc ? (
                      <img
                        src={qrCodeSrc}
                        alt="PIX QR code"
                        className={styles.qrCode}
                      />
                    ) : null}
                  </div>

                  <div className={styles.metrics}>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Provider</span>
                      <strong>{onRampQuote.quote.provider}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>PIX key</span>
                      <strong className={styles.breakValue}>
                        {onRampQuote.depositInstructions.pixKey || 'Provided in your bank app'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Expires</span>
                      <strong>
                        {formatDateTime(onRampQuote.depositInstructions.expiresAt)}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>ETA</span>
                      <strong>
                        {formatDuration(onRampQuote.quote.estimatedDuration)}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Exchange rate</span>
                      <strong>
                        1 {onRampQuote.quote.fromCurrency} ={' '}
                        {Number(onRampQuote.quote.exchangeRate).toLocaleString(
                          'en-US',
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          },
                        )}{' '}
                        {onRampAsset?.symbol ?? 'USDC'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Transaction ID</span>
                      <strong className={styles.breakValue}>
                        {onRampQuote.transactionId}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.statusCard}>
                    <div className={styles.statusHeader}>
                      <span>Status</span>
                      <span
                        className={cn(
                          styles.statusBadge,
                          styles.statusBadgeNeutral,
                        )}
                      >
                        {onRampStatus?.status || 'Pending payment'}
                      </span>
                    </div>
                    <div className={styles.statusGrid}>
                      <div>
                        <span className={styles.statusLabel}>Deposit status</span>
                        <strong>{onRampStatus?.depositStatus || 'Awaiting payment'}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Settlement</span>
                        <strong>{onRampStatus?.settlementAddress || onRampForm.toAddress}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Created</span>
                        <strong>{formatDateTime(onRampStatus?.createdAt)}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Updated</span>
                        <strong>{formatDateTime(onRampStatus?.updatedAt)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {!isOnRamp && offRampQuote ? (
                <div className={styles.resultStack}>
                  <div className={styles.heroCard}>
                    <div>
                      <span className={styles.heroLabel}>Estimated payout</span>
                      <div className={styles.heroAmount}>
                        {formatCurrency(offRampQuote.quote.toAmount, 'BRL')}
                      </div>
                      <div className={styles.heroSub}>
                        {formatTokenAmount(
                          offRampQuote.quote.fromAmount,
                          offRampQuote.quote.fromToken.symbol,
                        )}{' '}
                        from {offRampAsset?.chainLabel ?? 'network'}
                      </div>
                    </div>
                    <div className={styles.heroSide}>
                      <span className={styles.heroLabel}>ETA</span>
                      <div className={styles.heroSideValue}>
                        {formatDuration(offRampQuote.quote.estimatedDuration)}
                      </div>
                    </div>
                  </div>

                  <div className={styles.metrics}>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Provider</span>
                      <strong>{offRampQuote.quote.provider}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>PIX payout</span>
                      <strong>{offRampForm.pixKey}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Exchange rate</span>
                      <strong>{offRampQuote.quote.exchangeRate}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Approval spender</span>
                      <strong className={styles.breakValue}>
                        {offRampApprovalTarget || 'No approval required'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Deposit contract</span>
                      <strong className={styles.breakValue}>
                        {offRampDepositTarget ||
                          'Orda did not return a transaction request'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Transaction ID</span>
                      <strong className={styles.breakValue}>
                        {offRampQuote.transactionId}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.statusCard}>
                    <div className={styles.statusHeader}>
                      <span>Status</span>
                      <span
                        className={cn(
                          styles.statusBadge,
                          offRampStatus?.status === 'Completed'
                            ? styles.statusBadgeSuccess
                            : offRampStatus?.status === 'Failed'
                              ? styles.statusBadgeError
                              : styles.statusBadgeNeutral,
                        )}
                      >
                        {offRampStatus?.status || 'Quote ready'}
                      </span>
                    </div>
                    <div className={styles.statusGrid}>
                      <div>
                        <span className={styles.statusLabel}>Deposit address</span>
                        <strong className={styles.breakValue}>
                          {offRampStatus?.depositAddress ||
                            offRampDepositTarget ||
                            'Awaiting provider instructions'}
                        </strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Deposit amount</span>
                        <strong>{offRampStatus?.depositAmount || offRampQuote.quote.fromAmount}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Created</span>
                        <strong>{formatDateTime(offRampStatus?.createdAt)}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Updated</span>
                        <strong>{formatDateTime(offRampStatus?.updatedAt)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {(isOnRamp ? !onRampQuote : !offRampQuote) ? (
                <div className={styles.emptyState}>
                  Fill the form on the left and generate a live {isOnRamp ? 'on-ramp' : 'off-ramp'} quote.
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}
