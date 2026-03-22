import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

import { Authentication, Registration } from 'webauthx/server'
import {
  createWalletClient,
  erc20Abi,
  http,
  isAddress,
  type Address,
  type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { z } from 'zod'

import { monadMainnet, monadUsdc } from '@/lib/chains'
import {
  PASSKEY_RECENT_AUTH_WINDOW_MS,
  PASSKEY_SESSION_MAX_AGE,
  type PasskeyWalletSnapshot,
} from '@/lib/passkey-wallet'

const WALLET_COOKIE = 'urubu_passkey_wallet'
const SESSION_COOKIE = 'urubu_passkey_session'
const CHALLENGE_COOKIE = 'urubu_passkey_challenge'

const walletCookieSchema = z.object({
  address: z.string(),
  credentialId: z.string(),
  createdAt: z.number(),
  label: z.string(),
  privateKey: z.string(),
  publicKey: z.string(),
  version: z.literal(1),
})

const sessionCookieSchema = z.object({
  address: z.string(),
  verifiedAt: z.number(),
  version: z.literal(1),
})

const challengeCookieSchema = z.object({
  challenge: z.string(),
  createdAt: z.number(),
  label: z.string().nullable().optional(),
  type: z.enum(['auth', 'register']),
  version: z.literal(1),
})

type WalletCookie = z.infer<typeof walletCookieSchema>
type SessionCookie = z.infer<typeof sessionCookieSchema>
type ChallengeCookie = z.infer<typeof challengeCookieSchema>

type CookieReader = {
  get: (name: string) => { value: string } | undefined
}

type CookieWriter = {
  delete: (name: string) => void
  set: (options: {
    name: string
    value: string
    httpOnly?: boolean
    maxAge?: number
    path?: string
    sameSite?: 'lax' | 'strict' | 'none'
    secure?: boolean
  }) => void
}

export type CookieMutation =
  | {
      name: string
      type: 'delete'
    }
  | {
      options: Parameters<CookieWriter['set']>[0]
      type: 'set'
    }

function getPasskeyOrigin() {
  return process.env.PASSKEY_ORIGIN ?? 'https://urubu.money'
}

function getPasskeyRpId() {
  return process.env.PASSKEY_RP_ID ?? 'urubu.money'
}

function getCookieSecret() {
  const explicitSecret = process.env.PASSKEY_WALLET_SECRET
  if (explicitSecret) return explicitSecret

  if (process.env.NODE_ENV === 'production') {
    throw new Error('PASSKEY_WALLET_SECRET e obrigatoria em producao.')
  }

  return 'urubu-local-dev-secret'
}

function getCookieKey() {
  return createHash('sha256').update(getCookieSecret()).digest()
}

function sealCookieValue(value: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getCookieKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

function unsealCookieValue<T>(value: string, schema: z.ZodSchema<T>) {
  try {
    const payload = Buffer.from(value, 'base64url')
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const encrypted = payload.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', getCookieKey(), iv)
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8')

    return schema.parse(JSON.parse(decrypted))
  } catch {
    return null
  }
}

function cookieOptions(httpOnly = true) {
  return {
    httpOnly,
    path: '/',
    sameSite: 'lax' as const,
    secure: getPasskeyOrigin().startsWith('https://'),
  }
}

function normalizeLabel(label?: string | null) {
  const trimmed = label?.trim()
  if (!trimmed) return 'Carteira Urubu'
  return trimmed.slice(0, 32)
}

function readCookie<T>(
  cookieStore: CookieReader,
  name: string,
  schema: z.ZodSchema<T>,
) {
  const cookie = cookieStore.get(name)?.value
  if (!cookie) return null
  return unsealCookieValue(cookie, schema)
}

function setCookie(
  responseCookies: CookieWriter,
  name: string,
  value: unknown,
  maxAge: number,
  httpOnly = true,
) {
  responseCookies.set({
    ...cookieOptions(httpOnly),
    maxAge,
    name,
    value: sealCookieValue(value),
  })
}

export function createBufferedCookieWriter(mutations: CookieMutation[]): CookieWriter {
  return {
    delete(name: string) {
      mutations.push({ name, type: 'delete' })
    },
    set(options) {
      mutations.push({ options, type: 'set' })
    },
  }
}

function clearCookie(responseCookies: CookieWriter, name: string) {
  responseCookies.delete(name)
}

export function getWallet(cookieStore: CookieReader) {
  return readCookie(cookieStore, WALLET_COOKIE, walletCookieSchema)
}

export function getSession(cookieStore: CookieReader) {
  return readCookie(cookieStore, SESSION_COOKIE, sessionCookieSchema)
}

export function getSnapshot(cookieStore: CookieReader): PasskeyWalletSnapshot {
  const wallet = getWallet(cookieStore)
  const session = getSession(cookieStore)
  const connected = Boolean(
    wallet &&
      session &&
      wallet.address.toLowerCase() === session.address.toLowerCase(),
  )

  return {
    address: wallet?.address ?? null,
    connected,
    hasWallet: Boolean(wallet),
    label: wallet?.label ?? null,
  }
}

function setChallenge(
  responseCookies: CookieWriter,
  challenge: ChallengeCookie,
) {
  setCookie(responseCookies, CHALLENGE_COOKIE, challenge, 60 * 5)
}

function consumeChallenge(
  cookieStore: CookieReader,
  responseCookies: CookieWriter,
  type: ChallengeCookie['type'],
) {
  const challenge = readCookie(cookieStore, CHALLENGE_COOKIE, challengeCookieSchema)
  clearCookie(responseCookies, CHALLENGE_COOKIE)

  if (!challenge || challenge.type !== type) {
    throw new Error('O desafio da passkey expirou. Tente de novo.')
  }

  return challenge
}

export function clearPasskeySession(responseCookies: CookieWriter) {
  clearCookie(responseCookies, SESSION_COOKIE)
}

function setPasskeySession(responseCookies: CookieWriter, address: Address) {
  setCookie(
    responseCookies,
    SESSION_COOKIE,
    {
      address,
      verifiedAt: Date.now(),
      version: 1,
    } satisfies SessionCookie,
    PASSKEY_SESSION_MAX_AGE,
  )
}

export function createRegistrationOptions(
  responseCookies: CookieWriter,
  label?: string | null,
) {
  const normalizedLabel = normalizeLabel(label)
  const { challenge, options } = Registration.getOptions({
    authenticatorSelection: {
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'required',
    },
    name: normalizedLabel,
    rp: {
      id: getPasskeyRpId(),
      name: 'Urubu Money',
    },
  })

  setChallenge(responseCookies, {
    challenge,
    createdAt: Date.now(),
    label: normalizedLabel,
    type: 'register',
    version: 1,
  })

  return options
}

export function verifyRegistration(
  cookieStore: CookieReader,
  responseCookies: CookieWriter,
  credential: unknown,
) {
  const challenge = consumeChallenge(cookieStore, responseCookies, 'register')
  const result = Registration.verify(credential as Registration.Credential, {
    challenge: challenge.challenge as Hex,
    origin: getPasskeyOrigin(),
    rpId: getPasskeyRpId(),
  })

  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)

  setCookie(
    responseCookies,
    WALLET_COOKIE,
    {
      address: account.address,
      credentialId: result.credential.id,
      createdAt: Date.now(),
      label: normalizeLabel(challenge.label),
      privateKey,
      publicKey: result.credential.publicKey,
      version: 1,
    } satisfies WalletCookie,
    60 * 60 * 24 * 365,
  )

  setPasskeySession(responseCookies, account.address)

  return {
    address: account.address,
    connected: true,
    hasWallet: true,
    label: normalizeLabel(challenge.label),
  } satisfies PasskeyWalletSnapshot
}

export function createAuthenticationOptions(
  cookieStore: CookieReader,
  responseCookies: CookieWriter,
) {
  const wallet = getWallet(cookieStore)
  if (!wallet) {
    throw new Error('Nenhuma carteira com passkey foi encontrada neste navegador.')
  }

  const { challenge, options } = Authentication.getOptions({
    credentialId: wallet.credentialId,
    rpId: getPasskeyRpId(),
    userVerification: 'required',
  })

  setChallenge(responseCookies, {
    challenge,
    createdAt: Date.now(),
    type: 'auth',
    version: 1,
  })

  return options
}

export function verifyAuthentication(
  cookieStore: CookieReader,
  responseCookies: CookieWriter,
  response: unknown,
) {
  const wallet = getWallet(cookieStore)
  if (!wallet) {
    throw new Error('Nenhuma carteira com passkey foi encontrada neste navegador.')
  }

  const challenge = consumeChallenge(cookieStore, responseCookies, 'auth')
  const valid = Authentication.verify(response as Authentication.Response, {
    challenge: challenge.challenge as Hex,
    origin: getPasskeyOrigin(),
    publicKey: wallet.publicKey as Hex,
    rpId: getPasskeyRpId(),
  })

  if (!valid) {
    throw new Error('Falha ao verificar a passkey.')
  }

  setPasskeySession(responseCookies, wallet.address as Address)

  return {
    address: wallet.address,
    connected: true,
    hasWallet: true,
    label: wallet.label,
  } satisfies PasskeyWalletSnapshot
}

export async function sendUsdcTransfer(
  cookieStore: CookieReader,
  amount: bigint,
  recipient: Address,
  tokenAddress: Address,
) {
  const wallet = getWallet(cookieStore)
  const session = getSession(cookieStore)

  if (!wallet || !session) {
    throw new Error('Desbloqueie sua carteira com passkey primeiro.')
  }

  if (wallet.address.toLowerCase() !== session.address.toLowerCase()) {
    throw new Error('A sessao da carteira nao bate. Desbloqueie novamente.')
  }

  if (Date.now() - session.verifiedAt > PASSKEY_RECENT_AUTH_WINDOW_MS) {
    throw new Error('A confirmacao da passkey expirou. Confirme de novo.')
  }

  if (!isAddress(wallet.address) || !isAddress(recipient) || !isAddress(tokenAddress)) {
    throw new Error('Payload de transferencia invalido.')
  }

  if (tokenAddress.toLowerCase() !== monadUsdc.address.toLowerCase()) {
    throw new Error('So transferencias de USDC na Monad sao suportadas.')
  }

  const account = privateKeyToAccount(wallet.privateKey as Hex)
  const client = createWalletClient({
    account,
    chain: monadMainnet,
    transport: http(monadMainnet.rpcUrls.default.http[0]),
  })

  return client.writeContract({
    abi: erc20Abi,
    address: tokenAddress,
    args: [recipient, amount],
    functionName: 'transfer',
  })
}
