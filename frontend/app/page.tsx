import { APP_URL } from '@/lib/constants'
import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

const App = dynamic(() => import('@/components/pages/app'), {
  ssr: false,
  loading: () => null,
})

const launchUrl = `${APP_URL}/?miniApp=true`

const frame = {
  version: 'next',
  imageUrl: `${APP_URL}/images/feed.png`,
  button: {
    title: 'Abrir jogo',
    action: {
      type: 'launch_frame',
      name: 'Urubu do Nomad',
      url: launchUrl,
      splashImageUrl: `${APP_URL}/images/splash.png`,
      splashBackgroundColor: '#0e0e1a',
    },
  },
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Urubu do Nomad',
    description:
      'Jogo da MON com preco ao vivo, visual da Monad e pronto para abrir dentro do Farcaster.',
    openGraph: {
      title: 'Urubu do Nomad',
      description:
        'Jogo da MON com preco ao vivo, visual da Monad e pronto para abrir dentro do Farcaster.',
      images: [`${APP_URL}/images/og.png`],
    },
    other: {
      'fc:frame': JSON.stringify(frame),
    },
  }
}

export default function Home() {
  return <App />
}
