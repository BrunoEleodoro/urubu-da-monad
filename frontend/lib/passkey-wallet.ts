import { z } from 'zod'

export const PASSKEY_SESSION_MAX_AGE = 60 * 60 * 24 * 30
export const PASSKEY_RECENT_AUTH_WINDOW_MS = 1000 * 60 * 2

export const passkeyWalletSnapshotSchema = z.object({
  address: z.string().nullable(),
  connected: z.boolean(),
  hasWallet: z.boolean(),
  label: z.string().nullable(),
})

export type PasskeyWalletSnapshot = z.infer<typeof passkeyWalletSnapshotSchema>

export const passkeyRegisterOptionsRequestSchema = z.object({
  label: z.string().trim().min(2).max(32).optional(),
})

export const passkeyRegisterVerifyRequestSchema = z.object({
  credential: z.unknown(),
})

export const passkeyAuthenticateVerifyRequestSchema = z.object({
  response: z.unknown(),
})

export const passkeyTransferRequestSchema = z.object({
  amount: z.string().regex(/^\d+$/),
  recipient: z.string(),
  tokenAddress: z.string(),
})
