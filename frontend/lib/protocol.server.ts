import {
  http,
  type Address,
  createPublicClient,
  getAddress,
  isAddress,
} from 'viem'

import { monadMainnet } from '@/lib/chains'
import {
  binaryAbi,
  binaryContractAddress,
  liquidityVaultAbi,
  oracleAbi,
  protocolLogChunkSize,
  protocolLookbackBlocks,
} from '@/lib/protocol'

const publicClient = createPublicClient({
  chain: monadMainnet,
  transport: http(monadMainnet.rpcUrls.default.http[0]),
})

async function findRecentActivePositionId(trader: Address) {
  const latestBlock = await publicClient.getBlockNumber()
  const startBlock =
    latestBlock > protocolLookbackBlocks
      ? latestBlock - protocolLookbackBlocks
      : BigInt(0)

  let toBlock = latestBlock

  while (toBlock >= startBlock) {
    const fromBlock =
      toBlock > protocolLogChunkSize - BigInt(1)
        ? toBlock - (protocolLogChunkSize - BigInt(1))
        : BigInt(0)

    const logs = await publicClient.getContractEvents({
      abi: binaryAbi,
      address: binaryContractAddress,
      args: { trader },
      eventName: 'PositionOpened',
      fromBlock: fromBlock < startBlock ? startBlock : fromBlock,
      toBlock,
    })

    for (const log of [...logs].reverse()) {
      const id = log.args.id

      if (typeof id !== 'bigint') continue

      const position = await publicClient.readContract({
        address: binaryContractAddress,
        abi: binaryAbi,
        functionName: 'positions',
        args: [id],
      })

      const normalizedTrader = getAddress(trader)
      const positionTrader = getAddress(position[0])

      if (!position[6] && positionTrader === normalizedTrader) {
        return id
      }
    }

    if (fromBlock === BigInt(0) || fromBlock <= startBlock) break
    toBlock = fromBlock - BigInt(1)
  }

  return null
}

export async function recoverRecentActivePositionId(rawTrader: string) {
  if (!isAddress(rawTrader)) {
    throw new Error('Endereco de trader invalido.')
  }

  return findRecentActivePositionId(getAddress(rawTrader))
}

async function getProtocolCoreSnapshot() {
  const [
    vaultAddress,
    oracleAddress,
    feeBps,
    duration,
    maxPayout,
    maxUtilizationBps,
    owner,
    paused,
  ] = await Promise.all([
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'vault',
    }),
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'oracle',
    }),
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'feeBps',
    }),
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'duration',
    }),
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'maxPayout',
    }),
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'maxUtilizationBps',
    }),
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'owner',
    }),
    publicClient.readContract({
      address: binaryContractAddress,
      abi: binaryAbi,
      functionName: 'paused',
    }),
  ])

  const [vaultTotalAssets, vaultLockedAssets, vaultTotalSupply, oraclePrice] =
    await Promise.all([
      publicClient.readContract({
        address: vaultAddress,
        abi: liquidityVaultAbi,
        functionName: 'totalAssets',
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: liquidityVaultAbi,
        functionName: 'lockedAssets',
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: liquidityVaultAbi,
        functionName: 'totalSupply',
      }),
      publicClient.readContract({
        address: oracleAddress,
        abi: oracleAbi,
        functionName: 'getPrice',
      }),
    ])

  return {
    binaryAddress: binaryContractAddress,
    duration: Number(duration),
    feeBps: Number(feeBps),
    maxPayout,
    maxUtilizationBps: Number(maxUtilizationBps),
    oracleAddress,
    oraclePrice,
    owner,
    paused,
    vaultAddress,
    vaultLockedAssets,
    vaultTotalAssets,
    vaultTotalSupply,
  }
}

export async function getProtocolSnapshot(positionId?: bigint | null) {
  const core = await getProtocolCoreSnapshot()

  if (positionId === null || positionId === undefined) {
    return {
      ...core,
      maxPayout: core.maxPayout.toString(),
      oraclePrice: core.oraclePrice.toString(),
      position: null,
      vaultLockedAssets: core.vaultLockedAssets.toString(),
      vaultTotalAssets: core.vaultTotalAssets.toString(),
      vaultTotalSupply: core.vaultTotalSupply.toString(),
    }
  }

  const position = await publicClient.readContract({
    address: binaryContractAddress,
    abi: binaryAbi,
    functionName: 'positions',
    args: [positionId],
  })

  const currentPayout = await publicClient.readContract({
    address: binaryContractAddress,
    abi: binaryAbi,
    functionName: 'currentPayout',
    args: [positionId],
  })

  return {
    ...core,
    maxPayout: core.maxPayout.toString(),
    oraclePrice: core.oraclePrice.toString(),
    position: {
      currentPayout: currentPayout.toString(),
      entryPrice: position[3].toString(),
      id: positionId.toString(),
      isLong: position[1],
      liquidationPrice: position[4].toString(),
      openTime: Number(position[5]),
      settled: position[6],
      stake: position[2].toString(),
      trader: position[0],
    },
    vaultLockedAssets: core.vaultLockedAssets.toString(),
    vaultTotalAssets: core.vaultTotalAssets.toString(),
    vaultTotalSupply: core.vaultTotalSupply.toString(),
  }
}
