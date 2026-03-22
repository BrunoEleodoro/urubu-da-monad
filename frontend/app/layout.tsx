import type { Metadata } from 'next'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'

import { Providers } from '@/components/providers'
import { APP_URL } from '@/lib/constants'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Urubu do Nomad',
    template: '%s | Urubu do Nomad',
  },
  description:
    'Jogo de preco da MON com dados ao vivo, visual da Monad e pronto para rodar como mini app no Farcaster.',
  applicationName: 'Urubu do Nomad',
  alternates: {
    canonical: APP_URL,
  },
  keywords: ['urubu', 'nomad', 'monad', 'farcaster', 'miniapp', 'pyth'],
  openGraph: {
    title: 'Urubu do Nomad',
    description:
      'Jogo de preco da MON com dados ao vivo, visual da Monad e pronto para rodar como mini app no Farcaster.',
    url: APP_URL,
    siteName: 'Urubu do Nomad',
    type: 'website',
    images: [
      {
        url: '/images/og.png',
        width: 1600,
        height: 832,
        alt: 'Urubu do Nomad preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Urubu do Nomad',
    description:
      'Jogo de preco da MON com dados ao vivo, visual da Monad e pronto para rodar como mini app no Farcaster.',
    images: ['/images/og.png'],
  },
  icons: {
    icon: [
      {
        rel: 'icon',
        type: 'image/x-icon',
        url: '/favicon.ico',
      },
      {
        type: 'image/png',
        sizes: '1024x1024',
        url: '/images/icon.png',
      },
    ],
    shortcut: '/favicon.ico',
    apple: '/images/icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${dmSans.variable} ${jetBrainsMono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
