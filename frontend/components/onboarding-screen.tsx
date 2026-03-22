'use client'

import { useState } from 'react'

import styles from './onboarding-screen.module.css'

interface OnboardingScreenProps {
  busy: boolean
  error: string | null
  onCreateWallet: (label?: string) => Promise<void>
}

const STEPS = [
  {
    eyebrow: 'Bem-vindo',
    title: 'O Urubu Money transforma preço ao vivo em rodada rápida',
    description:
      'Acompanhe o gráfico da MON em tempo real, escolha alta ou baixa e acompanhe cada rodada com dados do oráculo da Pyth.',
  },
  {
    eyebrow: 'Como funciona',
    title: 'Você opera com fluxo real, mas a leitura é simples',
    description:
      'Cada entrada pede a confirmação de 1 USDC na Monad Mainnet. O gráfico e a tabela ficam ao vivo o tempo todo, e o fluxo de depósito e saque via PIX continua disponível no app.',
  },
  {
    eyebrow: 'Sua carteira',
    title: 'Crie sua carteira com passkey para começar',
    description:
      'Sem extensão, sem seed phrase e sem login por email. Sua carteira fica protegida pela passkey do seu dispositivo dentro do domínio urubu.money.',
  },
] as const

export function OnboardingScreen({
  busy,
  error,
  onCreateWallet,
}: OnboardingScreenProps) {
  const [step, setStep] = useState(0)
  const [walletLabel, setWalletLabel] = useState('Carteira Urubu')

  const current = STEPS[step]
  const isLastStep = step === STEPS.length - 1

  return (
    <main className={styles.screen}>
      <section className={styles.shell} aria-labelledby="onboarding-title">
        <div className={styles.hero}>
          <span className={styles.badge}>Primeiros passos</span>
          <h1 id="onboarding-title" className={styles.title}>
            {current.title}
          </h1>
          <p className={styles.description}>{current.description}</p>

          <div className={styles.indicators} aria-hidden="true">
            {STEPS.map((entry, index) => (
              <span
                key={entry.eyebrow}
                className={index === step ? styles.indicatorActive : styles.indicator}
              />
            ))}
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardEyebrow}>{current.eyebrow}</div>
            <div className={styles.cardTitle}>{current.title}</div>
            <div className={styles.cardBody}>{current.description}</div>

            {isLastStep ? (
              <div className={styles.walletBox}>
                <label className={styles.field} htmlFor="wallet-label">
                  Nome da carteira
                </label>
                <input
                  id="wallet-label"
                  className={styles.input}
                  value={walletLabel}
                  onChange={(event) => setWalletLabel(event.currentTarget.value)}
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
                  {busy ? 'Criando sua carteira...' : 'Criar carteira com passkey'}
                </button>

                <p className={styles.helper}>
                  Essa carteira fica vinculada ao armazenamento deste navegador.
                </p>
              </div>
            ) : (
              <div className={styles.actions}>
                {step > 0 ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setStep((value) => Math.max(0, value - 1))}
                  >
                    Voltar
                  </button>
                ) : null}

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() =>
                    setStep((value) => Math.min(STEPS.length - 1, value + 1))
                  }
                >
                  Continuar
                </button>
              </div>
            )}

            {error ? <div className={styles.errorBox}>{error}</div> : null}
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>O que você encontra aqui</div>
            <ul className={styles.list}>
              <li>Gráfico de preço da MON com atualização ao vivo.</li>
              <li>Tabela em tempo real com preço, confiança, EMA e horário.</li>
              <li>Rodadas rápidas para escolher alta ou baixa.</li>
              <li>Depósito e saque com PIX via Orda.</li>
              <li>Carteira no navegador protegida por passkey.</li>
            </ul>

            <div className={styles.note}>
              Quando você já tiver uma passkey cadastrada, essa etapa desaparece e o site abre direto com a carteira carregada.
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
