import App from '@/components/pages/app'
import { APP_URL } from '@/lib/constants'
import type { Metadata } from 'next'

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
      'Live MON price game themed for Monad and ready to launch inside Farcaster.',
    openGraph: {
      title: 'Urubu do Nomad',
      description:
        'Live MON price game themed for Monad and ready to launch inside Farcaster.',
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
