import { z } from 'zod'

import type { Address } from 'viem'

export const binaryContractAddress =
  '0x576238b24826Ffac2EeE798d6958A080c4806884' as Address

export const protocolLookbackBlocks = BigInt(5_000)
export const protocolLogChunkSize = BigInt(100)

export const binaryAbi = [
  {
    type: 'function',
    name: 'asset',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'currentPayout',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'duration',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'liquidationPrice',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxPayout',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxUtilizationBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'openPosition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'isLong', type: 'bool' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'oracle',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      { name: 'trader', type: 'address' },
      { name: 'isLong', type: 'bool' },
      { name: 'stake', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'liquidationPrice', type: 'uint256' },
      { name: 'openTime', type: 'uint256' },
      { name: 'settled', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'settle',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'vault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'event',
    name: 'PositionOpened',
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'trader', type: 'address' },
      { indexed: false, name: 'isLong', type: 'bool' },
      { indexed: false, name: 'stake', type: 'uint256' },
      { indexed: false, name: 'lockedAmount', type: 'uint256' },
      { indexed: false, name: 'entryPrice', type: 'uint256' },
      { indexed: false, name: 'liquidationPrice', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'PositionSettled',
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'settler', type: 'address' },
      { indexed: false, name: 'payout', type: 'uint256' },
      { indexed: false, name: 'exitPrice', type: 'uint256' },
    ],
  },
] as const

export const liquidityVaultAbi = [
  {
    type: 'function',
    name: 'asset',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'lockedAssets',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalAssets',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

export const oracleAbi = [
  {
    type: 'function',
    name: 'getPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

export const protocolPositionResponseSchema = z.object({
  id: z.string().nullable(),
})

export const protocolSnapshotSchema = z.object({
  binaryAddress: z.string(),
  feeBps: z.number(),
  maxPayout: z.string(),
  maxUtilizationBps: z.number(),
  oracleAddress: z.string(),
  oraclePrice: z.string(),
  owner: z.string(),
  paused: z.boolean(),
  position: z
    .object({
      currentPayout: z.string(),
      entryPrice: z.string(),
      id: z.string(),
      isLong: z.boolean(),
      liquidationPrice: z.string(),
      openTime: z.number(),
      settled: z.boolean(),
      stake: z.string(),
      trader: z.string(),
    })
    .nullable(),
  duration: z.number(),
  vaultAddress: z.string(),
  vaultLockedAssets: z.string(),
  vaultTotalAssets: z.string(),
  vaultTotalSupply: z.string(),
})

export const passkeyProtocolActionRequestSchema = z.discriminatedUnion(
  'action',
  [
    z.object({
      action: z.literal('open-position'),
      amount: z.string().regex(/^\d+$/),
      contractAddress: z.string(),
      isLong: z.boolean(),
      tokenAddress: z.string(),
    }),
    z.object({
      action: z.literal('settle-position'),
      contractAddress: z.string(),
      positionId: z.string().regex(/^\d+$/),
    }),
  ],
)

export type ProtocolSnapshot = z.infer<typeof protocolSnapshotSchema>
