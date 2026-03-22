'use client'

import dynamic from 'next/dynamic'

import { OrdaProvider, createAppKitConfig } from '@ordanetwork/sdk/react'

import { APP_URL } from '@/lib/constants'
import {
  ORDA_WIDGET_NETWORKS,
  getWalletConnectProjectId,
} from '@/lib/orda'

import styles from './orda-ramp-sheet.module.css'

export type RampMode = 'onRamp' | 'offRamp'

const walletConnectProjectId = getWalletConnectProjectId()

const appKitConfig = walletConnectProjectId
  ? createAppKitConfig({
      projectId: walletConnectProjectId,
      metadata: {
        name: 'Urubu do Nomad',
        description: 'BRL on-ramp and off-ramp powered by Orda',
        url: APP_URL,
        icons: [`${APP_URL}/images/icon.png`],
      },
    })
  : null

const OrdaWidget = dynamic(
  async () => {
    const mod = await import('@ordanetwork/sdk/react')
    return mod.Widget
  },
  {
    loading: () => (
      <div className={styles.widgetLoading}>Loading Orda widget...</div>
    ),
    ssr: false,
  },
)

async function getOrdaToken() {
  const response = await fetch('/api/orda/token', {
    method: 'POST',
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        expiresAt?: number
        jwt?: string
        message?: string
      }
    | null

  if (!response.ok || !payload?.jwt) {
    throw new Error(payload?.message || 'Unable to authenticate with Orda.')
  }

  return {
    expiresAt: payload.expiresAt ?? Date.now() + 60 * 60 * 1000,
    jwt: payload.jwt,
  }
}

interface OrdaRampSheetProps {
  mode: RampMode
  onBack: () => void
}

export function OrdaRampView({
  mode,
  onBack,
}: OrdaRampSheetProps) {
  const isOnRamp = mode === 'onRamp'
  const title = isOnRamp ? 'On-ramp' : 'Off-ramp'
  const description = isOnRamp
    ? 'Buy crypto with BRL and PIX through Orda, then bridge or move funds as needed.'
    : 'Convert supported crypto back into BRL with PIX withdrawal inside the Orda flow.'
  const note = isOnRamp
    ? 'Pick Fiat or BRL as the source inside the widget, then choose one of the supported crypto networks as the destination.'
    : 'Pick a supported crypto token as the source inside the widget, then choose BRL or PIX as the cash-out destination.'

  return (
    <main className={styles.screen}>
      <section className={styles.shell} aria-labelledby="orda-ramp-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.badge}>Powered by Orda</span>
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
          <div className={styles.notice}>
            {note} The game itself stays Monad-only, while the Orda widget
            currently settles on its own supported networks.
          </div>

          <div className={styles.supportedNetworks}>
            Supported ramp networks today: {ORDA_WIDGET_NETWORKS.join(', ')}.
          </div>

          {appKitConfig ? (
            <OrdaProvider
              config={{
                appKitConfig,
                debug: process.env.NODE_ENV !== 'production',
                getToken: getOrdaToken,
              }}
            >
              <div className={styles.widgetWrap}>
                <OrdaWidget key={mode} />
              </div>
            </OrdaProvider>
          ) : (
            <div className={styles.emptyState}>
              Add <code>NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID</code> to enable
              the Orda widget connection flow.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
