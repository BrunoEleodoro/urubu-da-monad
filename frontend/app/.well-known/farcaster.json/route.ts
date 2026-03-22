import { NextResponse } from 'next/server'
import { APP_URL } from '../../../lib/constants'

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
    subtitle: 'Live oracle game',
    description:
      'Bet on the MON/USD move with live Pyth data in a Monad themed Farcaster mini app.',
    tagline: 'Bet the MON move',
    ogTitle: 'Urubu do Nomad',
    ogDescription: 'Live MON/USD game powered by Pyth and styled for Monad.',
    buttonTitle: 'Abrir jogo',
    primaryCategory: 'games',
    tags: ['monad', 'pyth', 'oracle', 'trading', 'games'],
    screenshotUrls: [],
    canonicalDomain: new URL(APP_URL).hostname,
  }

  const accountAssociation =
    process.env.FARCASTER_HEADER &&
    process.env.FARCASTER_PAYLOAD &&
    process.env.FARCASTER_SIGNATURE
      ? {
          header: process.env.FARCASTER_HEADER,
          payload: process.env.FARCASTER_PAYLOAD,
          signature: process.env.FARCASTER_SIGNATURE,
        }
      : undefined

  const farcasterConfig = {
    ...(accountAssociation ? { accountAssociation } : {}),
    miniapp: manifest,
    frame: manifest,
  };

  return NextResponse.json(farcasterConfig)
}
