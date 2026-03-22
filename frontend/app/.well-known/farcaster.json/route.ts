import { NextResponse } from 'next/server'
import { APP_URL } from '../../../lib/constants'

const accountAssociation = {
  header:
    'eyJmaWQiOjcwMDgzNSwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDgxOTMxYTlCQ2M3MzBFYzI1OGI4Q2Y5QzE1ODQ3ODBkNUJkZGFCMDUifQ',
  payload: 'eyJkb21haW4iOiJ1cnVidS1kYS1tb25hZC52ZXJjZWwuYXBwIn0',
  signature:
    'U+lUgHbwlE3WZ/w3OtEM9wnt7fpMkS45lgicAJNG26h/mE9Tft0xUbVNQOufjaP/Fmw/e50KKJExn2Y1KJq4Ahw=',
}

export async function GET() {
  const homeUrl = `${APP_URL}/?miniApp=true`
  const manifest = {
    version: '1',
    name: 'Urubu do Nomad',
    homeUrl,
    iconUrl: `${APP_URL}/images/icon.png`,
    imageUrl: `${APP_URL}/images/feed.png`,
    heroImageUrl: `${APP_URL}/images/og.png`,
    ogImageUrl: `${APP_URL}/images/og.png`,
    splashImageUrl: `${APP_URL}/images/splash.png`,
    splashBackgroundColor: '#0e0e1a',
    subtitle: 'Jogo de oracle ao vivo',
    description:
      'Aposte no movimento da MON com dados ao vivo da Pyth em um mini app do Farcaster com visual da Monad.',
    tagline: 'Aposte no movimento da MON',
    ogTitle: 'Urubu do Nomad',
    ogDescription: 'Jogo da MON com dados ao vivo da Pyth e visual da Monad.',
    buttonTitle: 'Abrir jogo',
    primaryCategory: 'games',
    tags: ['monad', 'pyth', 'oracle', 'trading', 'games'],
    screenshotUrls: [],
    canonicalDomain: new URL(APP_URL).hostname,
  }

  const farcasterConfig = {
    accountAssociation,
    miniapp: manifest,
    frame: manifest,
  }

  return NextResponse.json(farcasterConfig)
}
