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

  return `${numericValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${symbol}`
}

function formatOrdaStatus(value?: string | null) {
  if (!value) return ''

  const normalized = value.trim().toLowerCase()
  const dictionary: Record<string, string> = {
    completed: 'Concluido',
    complete: 'Concluido',
    failed: 'Falhou',
    pending: 'Pendente',
    processing: 'Processando',
    created: 'Criado',
    initiated: 'Iniciado',
    settled: 'Liquidado',
    settling: 'Liquidando',
    paid: 'Pago',
    quote_ready: 'Cotacao pronta',
    'quote ready': 'Cotacao pronta',
    pending_payment: 'Aguardando pagamento',
    'pending payment': 'Aguardando pagamento',
    awaiting_payment: 'Aguardando pagamento',
    'awaiting payment': 'Aguardando pagamento',
  }

  return dictionary[normalized] ?? value
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Alguns minutos'
  }

  if (seconds < 60) {
    return `${Math.round(seconds)} s`
  }

  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return 'Aguardando atualizacao'

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Aguardando atualizacao'
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
        : 'Nao foi possivel concluir esta solicitacao.'

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
  const title = isOnRamp ? 'Depositar' : 'Sacar'
  const description = isOnRamp
    ? 'Gere instrucoes de PIX com o SDK da Orda e receba USDC em uma rede EVM suportada.'
    : 'Gere uma cotacao de saque em BRL com o SDK da Orda e receba o pagamento via PIX.'
  const note = isOnRamp
    ? 'A Monad ainda aparece como em andamento na cobertura da Orda, entao este fluxo liquida em redes EVM suportadas enquanto o jogo continua exclusivo da Monad.'
    : 'Use o mesmo formato de endereco EVM que voce ja controla. O jogo continua na Monad, mas a liquidacao do saque da Orda acontece nas redes EVM suportadas.'

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
      setError(nextError instanceof Error ? nextError.message : 'Nao foi possivel criar a cotacao de deposito.')
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
      setError(nextError instanceof Error ? nextError.message : 'Nao foi possivel criar a cotacao de saque.')
    } finally {
      setLoading(false)
    }
  }

  const resultTitle = isOnRamp ? 'Instrucoes de PIX' : 'Cotacao de saque'
  const resultHint = isOnRamp
    ? 'O codigo PIX abaixo vem direto da sua cotacao mais recente de deposito na Orda.'
    : 'Esta cotacao vem direto da Orda. Envie o ativo de origem somente se quiser continuar com o saque.'

  return (
    <main className={styles.screen}>
      <section className={styles.shell} aria-labelledby="orda-ramp-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.badge}>Integração via Orda SDK</span>
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
            Voltar ao jogo
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.notice}>{note}</div>

          <div className={styles.supportedNetworks}>
            Rotas EVM suportadas hoje: {ORDA_RAMP_NETWORK_LABELS.join(', ')}.
          </div>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelEyebrow}>
                    {isOnRamp ? 'BRL para cripto' : 'Cripto para BRL'}
                  </div>
                  <h3 className={styles.panelTitle}>
                    {isOnRamp ? 'Criar deposito via PIX' : 'Criar saque via PIX'}
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
                    <span className={styles.fieldLabel}>Ativo de destino</span>
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
                    <span className={styles.fieldLabel}>Valor em BRL</span>
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
                    <span className={styles.fieldLabel}>Endereco de destino</span>
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
                    {loading ? 'Gerando cotacao...' : 'Gerar instrucoes de PIX'}
                  </button>
                </div>
              ) : (
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Ativo de origem</span>
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
                    <span className={styles.fieldLabel}>Quantidade do token</span>
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
                    <span className={styles.fieldLabel}>Endereco de origem</span>
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
                    <span className={styles.fieldLabel}>Nome completo</span>
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
                    <span className={styles.fieldLabel}>CPF ou CNPJ</span>
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
                    <span className={styles.fieldLabel}>Chave PIX</span>
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
                    {loading ? 'Gerando cotacao...' : 'Gerar cotacao de saque'}
                  </button>
                </div>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelEyebrow}>Resultado mais recente</div>
                  <h3 className={styles.panelTitle}>{resultTitle}</h3>
                </div>
                <span className={styles.panelMeta}>Resposta ao vivo do SDK</span>
              </div>

              <p className={styles.resultHint}>{resultHint}</p>

              {isOnRamp && onRampQuote ? (
                <div className={styles.resultStack}>
                  <div className={styles.heroCard}>
                    <div>
                      <span className={styles.heroLabel}>Pagar via PIX</span>
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
                        para {onRampAsset?.chainLabel ?? 'rede'}
                      </div>
                    </div>

                    {qrCodeSrc ? (
                      <img
                        src={qrCodeSrc}
                        alt="QR code PIX"
                        className={styles.qrCode}
                      />
                    ) : null}
                  </div>

                  <div className={styles.metrics}>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Provedor</span>
                      <strong>{onRampQuote.quote.provider}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Chave PIX</span>
                      <strong className={styles.breakValue}>
                        {onRampQuote.depositInstructions.pixKey || 'Disponivel no app do seu banco'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Expira em</span>
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
                      <span className={styles.metricLabel}>Taxa de cambio</span>
                      <strong>
                        1 {onRampQuote.quote.fromCurrency} ={' '}
                        {Number(onRampQuote.quote.exchangeRate).toLocaleString(
                          'pt-BR',
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6,
                          },
                        )}{' '}
                        {onRampAsset?.symbol ?? 'USDC'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>ID da transacao</span>
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
                        {formatOrdaStatus(onRampStatus?.status) || 'Aguardando pagamento'}
                      </span>
                    </div>
                    <div className={styles.statusGrid}>
                      <div>
                        <span className={styles.statusLabel}>Status do deposito</span>
                        <strong>{formatOrdaStatus(onRampStatus?.depositStatus) || 'Aguardando pagamento'}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Liquidacao</span>
                        <strong>{onRampStatus?.settlementAddress || onRampForm.toAddress}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Criado em</span>
                        <strong>{formatDateTime(onRampStatus?.createdAt)}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Atualizado em</span>
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
                      <span className={styles.heroLabel}>Valor estimado de saque</span>
                      <div className={styles.heroAmount}>
                        {formatCurrency(offRampQuote.quote.toAmount, 'BRL')}
                      </div>
                      <div className={styles.heroSub}>
                        {formatTokenAmount(
                          offRampQuote.quote.fromAmount,
                          offRampQuote.quote.fromToken.symbol,
                        )}{' '}
                        saindo de {offRampAsset?.chainLabel ?? 'rede'}
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
                      <span className={styles.metricLabel}>Provedor</span>
                      <strong>{offRampQuote.quote.provider}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Recebimento PIX</span>
                      <strong>{offRampForm.pixKey}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Taxa de cambio</span>
                      <strong>{offRampQuote.quote.exchangeRate}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Contrato de aprovacao</span>
                      <strong className={styles.breakValue}>
                        {offRampApprovalTarget || 'Nenhuma aprovacao necessaria'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>Contrato de deposito</span>
                      <strong className={styles.breakValue}>
                        {offRampDepositTarget ||
                          'A Orda nao retornou uma solicitacao de transacao'}
                      </strong>
                    </div>
                    <div className={styles.metric}>
                      <span className={styles.metricLabel}>ID da transacao</span>
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
                        {formatOrdaStatus(offRampStatus?.status) || 'Cotacao pronta'}
                      </span>
                    </div>
                    <div className={styles.statusGrid}>
                      <div>
                        <span className={styles.statusLabel}>Endereco de deposito</span>
                        <strong className={styles.breakValue}>
                          {offRampStatus?.depositAddress ||
                            offRampDepositTarget ||
                            'Aguardando instrucoes do provedor'}
                        </strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Valor do deposito</span>
                        <strong>{offRampStatus?.depositAmount || offRampQuote.quote.fromAmount}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Criado em</span>
                        <strong>{formatDateTime(offRampStatus?.createdAt)}</strong>
                      </div>
                      <div>
                        <span className={styles.statusLabel}>Atualizado em</span>
                        <strong>{formatDateTime(offRampStatus?.updatedAt)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {(isOnRamp ? !onRampQuote : !offRampQuote) ? (
                <div className={styles.emptyState}>
                  Preencha o formulario ao lado e gere uma cotacao ao vivo de {isOnRamp ? 'deposito' : 'saque'}.
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}
