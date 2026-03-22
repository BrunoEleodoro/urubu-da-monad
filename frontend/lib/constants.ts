export const MESSAGE_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30 // 30 days

function resolveAppUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_URL
  const publicVercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL
  const vercelUrl = process.env.VERCEL_URL

  const rawUrl =
    explicitUrl ||
    (publicVercelUrl ? `https://${publicVercelUrl}` : undefined) ||
    (vercelUrl ? `https://${vercelUrl}` : undefined) ||
    'http://localhost:3000'

  return rawUrl.replace(/\/$/, '')
}

export const APP_URL = resolveAppUrl()
