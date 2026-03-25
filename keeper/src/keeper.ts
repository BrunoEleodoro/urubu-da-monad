import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BINARY_ABI, ORACLE_ABI } from "./abi.js";

// ─── Minimal client interfaces ─────────────────────────────────────────────
// Using narrow interfaces instead of viem's full PublicClient/WalletClient so
// tests can inject plain mock objects without fighting the generic type maze.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArg = any;

export interface IPublicClient {
  getContractEvents(params: AnyArg): Promise<AnyArg[]>;
  readContract(params: AnyArg): Promise<AnyArg>;
  waitForTransactionReceipt(params: AnyArg): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
  }>;
  watchContractEvent(params: AnyArg): () => void;
}

export interface IWalletClient {
  writeContract(params: AnyArg): Promise<`0x${string}`>;
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface PositionEntry {
  isLong: boolean;
  liquidationPrice: bigint;
  entryPrice: bigint;
  stake: bigint;
  openTime: bigint; // block.timestamp when the position was opened
}

export interface KeeperConfig {
  rpcUrl: string;
  wsUrl: string | undefined;
  privateKey: `0x${string}`;
  binaryAddress: Address;
  fromBlock: bigint;
  pollIntervalMs: number;
  chain: Chain;
}

// ─── KeeperBot ─────────────────────────────────────────────────────────────

export class KeeperBot {
  private readonly config: KeeperConfig;
  private readonly publicClient: IPublicClient;
  private readonly walletClient: IWalletClient;

  // Exposed as protected so tests can read size / inject entries.
  protected readonly openPositions = new Map<bigint, PositionEntry>();

  private running = false;

  constructor(
    config: KeeperConfig,
    inject?: { publicClient?: IPublicClient; walletClient?: IWalletClient }
  ) {
    this.config = config;

    if (inject?.publicClient) {
      this.publicClient = inject.publicClient;
    } else {
      this.publicClient = createPublicClient({
        chain: config.chain,
        transport: http(config.rpcUrl),
      }) as unknown as IPublicClient;
    }

    if (inject?.walletClient) {
      this.walletClient = inject.walletClient;
    } else {
      const account = privateKeyToAccount(config.privateKey);
      this.walletClient = createWalletClient({
        account,
        chain: config.chain,
        transport: http(config.rpcUrl),
      }) as unknown as IWalletClient;
      console.log(`[keeper] account: ${account.address}`);
    }

    console.log(`[keeper] binary:  ${config.binaryAddress}`);
  }

  async start(): Promise<never> {
    this.running = true;
    await this.bootstrap();
    this.subscribeToEvents();
    return this.runLoop();
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────

  async bootstrap(): Promise<void> {
    console.log(
      `[keeper] bootstrapping from block ${this.config.fromBlock}...`
    );

    const [openedLogs, settledLogs] = await Promise.all([
      this.publicClient.getContractEvents({
        address: this.config.binaryAddress,
        abi: BINARY_ABI,
        eventName: "PositionOpened",
        fromBlock: this.config.fromBlock,
        toBlock: "latest",
      }),
      this.publicClient.getContractEvents({
        address: this.config.binaryAddress,
        abi: BINARY_ABI,
        eventName: "PositionSettled",
        fromBlock: this.config.fromBlock,
        toBlock: "latest",
      }),
    ]);

    const settledIds = new Set(
      settledLogs
        .map((l) => l.args.id)
        .filter((id): id is bigint => id !== undefined)
    );

    // Collect unsettled positions from logs, then fetch openTime from chain.
    const unsettled: Array<{ id: bigint; entry: Omit<PositionEntry, "openTime"> }> = [];

    for (const log of openedLogs) {
      const { id, isLong, liquidationPrice, entryPrice, stake } = log.args;
      if (
        id === undefined ||
        isLong === undefined ||
        liquidationPrice === undefined ||
        entryPrice === undefined ||
        stake === undefined
      ) {
        continue;
      }
      if (!settledIds.has(id)) {
        unsettled.push({ id, entry: { isLong, liquidationPrice, entryPrice, stake } });
      }
    }

    // Fetch openTime for each unsettled position from the contract.
    await Promise.all(
      unsettled.map(async ({ id, entry }) => {
        const pos = await this.publicClient.readContract({
          address: this.config.binaryAddress,
          abi: BINARY_ABI,
          functionName: "positions",
          args: [id],
        });
        // positions() returns tuple: [id, trader, isLong, stake, entryPrice, liquidationPrice, openTime, settled]
        const openTime = pos[6] as bigint;
        this.openPositions.set(id, { ...entry, openTime });
      })
    );

    console.log(
      `[keeper] bootstrapped — ${this.openPositions.size} open position(s)`
    );
  }

  // ─── Event subscriptions ─────────────────────────────────────────────────

  private subscribeToEvents(): void {
    const transport = this.config.wsUrl
      ? webSocket(this.config.wsUrl)
      : http(this.config.rpcUrl);

    const wsClient = createPublicClient({
      chain: this.config.chain,
      transport,
    }) as unknown as IPublicClient;

    wsClient.watchContractEvent({
      address: this.config.binaryAddress,
      abi: BINARY_ABI,
      eventName: "PositionOpened",
      onLogs: async (logs: AnyArg[]) => {
        for (const log of logs) {
          const { id, isLong, liquidationPrice, entryPrice, stake } = log.args;
          if (
            id === undefined ||
            isLong === undefined ||
            liquidationPrice === undefined ||
            entryPrice === undefined ||
            stake === undefined
          ) {
            continue;
          }
          const pos = await this.publicClient.readContract({
            address: this.config.binaryAddress,
            abi: BINARY_ABI,
            functionName: "positions",
            args: [id],
          });
          const openTime = pos[6] as bigint;
          this.openPositions.set(id, {
            isLong,
            liquidationPrice,
            entryPrice,
            stake,
            openTime,
          });
          console.log(
            `[keeper] +position #${id} | ${isLong ? "LONG" : "SHORT"} | liqPrice=${liquidationPrice} | openTime=${openTime}`
          );
        }
      },
    });

    wsClient.watchContractEvent({
      address: this.config.binaryAddress,
      abi: BINARY_ABI,
      eventName: "PositionSettled",
      onLogs: (logs: AnyArg[]) => {
        for (const log of logs) {
          const { id } = log.args;
          if (id === undefined) continue;
          this.openPositions.delete(id);
          console.log(`[keeper] -position #${id} settled externally`);
        }
      },
    });

    console.log(
      `[keeper] subscribed to events via ${this.config.wsUrl ? "WebSocket" : "HTTP polling"}`
    );
  }

  // ─── Main loop ───────────────────────────────────────────────────────────

  private async runLoop(): Promise<never> {
    console.log(
      `[keeper] loop started (interval=${this.config.pollIntervalMs}ms)`
    );

    while (this.running) {
      const start = Date.now();

      try {
        await this.tick();
      } catch (err) {
        console.error("[keeper] tick error:", err);
      }

      const elapsed = Date.now() - start;
      const remaining = this.config.pollIntervalMs - elapsed;
      if (remaining > 0) {
        await sleep(remaining);
      }
    }

    throw new Error("loop exited unexpectedly");
  }

  async tick(): Promise<void> {
    if (this.openPositions.size === 0) return;

    // Read oracle address from Binary, then fetch current price.
    const oracleAddress = await this.publicClient.readContract({
      address: this.config.binaryAddress,
      abi: BINARY_ABI,
      functionName: "oracle",
    }) as Address;

    const currentPrice = await this.publicClient.readContract({
      address: oracleAddress,
      abi: ORACLE_ABI,
      functionName: "getPrice",
    }) as bigint;

    if (currentPrice === 0n) {
      console.warn("[keeper] oracle returned 0 — skipping tick");
      return;
    }

    // Read the on-chain duration (seconds a position may stay open).
    const duration = await this.publicClient.readContract({
      address: this.config.binaryAddress,
      abi: BINARY_ABI,
      functionName: "duration",
    }) as bigint;

    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const eligible: bigint[] = [];

    for (const [id, pos] of this.openPositions) {
      const isExpired = nowSec >= pos.openTime + duration;
      const isLiquidatable = pos.isLong
        ? currentPrice <= pos.liquidationPrice
        : currentPrice >= pos.liquidationPrice;

      if (isExpired || isLiquidatable) {
        eligible.push(id);
      }
    }

    if (eligible.length === 0) return;

    console.log(
      `[keeper] price=${currentPrice} | ${eligible.length} eligible position(s): [${eligible.map((id) => `#${id}`).join(", ")}]`
    );

    await this.tryAutoSettle(eligible);
  }

  // ─── Auto-settle ─────────────────────────────────────────────────────────

  private async tryAutoSettle(eligibleIds: bigint[]): Promise<void> {
    console.log(
      `[keeper] calling autoSettle() for ${eligibleIds.length} position(s)...`
    );

    try {
      const hash = await this.walletClient.writeContract({
        address: this.config.binaryAddress,
        abi: BINARY_ABI,
        functionName: "autoSettle",
      });

      console.log(`[keeper] autoSettle() submitted: ${hash}`);

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        for (const id of eligibleIds) {
          this.openPositions.delete(id);
        }
        console.log(
          `[keeper] autoSettle() ✓ — removed ${eligibleIds.length} position(s) (block ${receipt.blockNumber})`
        );
      } else {
        console.error("[keeper] autoSettle() reverted on-chain");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("invalid oracle price")) {
        console.warn("[keeper] autoSettle(): oracle unavailable — will retry");
        return;
      }

      console.error(`[keeper] autoSettle() failed: ${message}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
