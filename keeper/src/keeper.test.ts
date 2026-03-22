import { describe, it, expect, vi, beforeEach } from "vitest";
import { type Address } from "viem";
import { KeeperBot, type IPublicClient, type IWalletClient } from "./keeper.js";

// ─── Constants ─────────────────────────────────────────────────────────────

const BINARY = "0x1111111111111111111111111111111111111111" as Address;
const ORACLE = "0x2222222222222222222222222222222222222222" as Address;

// Prices are in 6-decimal USDC units (e.g. 2000 USDC = 2_000_000_000n).
const ENTRY_PRICE = 2_000_000_000n; // 2000 USDC

// Liquidation prices computed the same way as the contract:
//   long:  entryPrice - entryPrice / (2 * 100) = 2000 - 10 = 1990 USDC
//   short: entryPrice + entryPrice / (2 * 100) = 2000 + 10 = 2010 USDC
const LIQ_PRICE_LONG = 1_990_000_000n; // 1990 USDC
const LIQ_PRICE_SHORT = 2_010_000_000n; // 2010 USDC

// Current price is safely between the two liquidation thresholds — no position
// is liquidatable on price grounds alone.
const CURRENT_PRICE = 2_001_000_000n; // 2001 USDC  (above long liq, below short liq)

const DURATION = 120n; // seconds, matching the protocol default
const TX_HASH = "0xdeadbeef" as `0x${string}`;
const STAKE = 100_000_000n; // 100 USDC

// ─── Helpers ───────────────────────────────────────────────────────────────

function nowSec(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/** Build a minimal mock position tuple as the contract returns it. */
function positionTuple(
  isLong: boolean,
  openTime: bigint
): [Address, boolean, bigint, bigint, bigint, bigint, boolean] {
  return [
    "0x3333333333333333333333333333333333333333",
    isLong,
    STAKE,
    ENTRY_PRICE,
    isLong ? LIQ_PRICE_LONG : LIQ_PRICE_SHORT,
    openTime,
    false,
  ];
}

/** Build the PositionOpened log args the bootstrap code reads from. */
function openedLogArgs(id: bigint, isLong: boolean) {
  return {
    args: {
      id,
      trader: "0x3333333333333333333333333333333333333333" as Address,
      isLong,
      stake: STAKE,
      lockedAmount: STAKE * 100n,
      entryPrice: ENTRY_PRICE,
      liquidationPrice: isLong ? LIQ_PRICE_LONG : LIQ_PRICE_SHORT,
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("KeeperBot — settle all positions after 120 seconds", () => {
  let publicClient: IPublicClient;
  let walletClient: IWalletClient;
  let bot: KeeperBot;

  beforeEach(() => {
    // All three positions were opened 130 seconds ago — past the 120 s window.
    const openTime = nowSec() - 130n;

    // ── publicClient mock ──────────────────────────────────────────────────
    publicClient = {
      getContractEvents: vi
        .fn()
        // First call: PositionOpened logs (positions 0, 1 = LONG, 2 = SHORT)
        .mockResolvedValueOnce([
          openedLogArgs(0n, true),
          openedLogArgs(1n, true),
          openedLogArgs(2n, false),
        ])
        // Second call: PositionSettled logs (none yet)
        .mockResolvedValueOnce([]),

      readContract: vi.fn().mockImplementation(({ functionName, args }) => {
        switch (functionName) {
          // Bootstrap: fetch openTime for each position
          case "positions":
            return Promise.resolve(positionTuple(args[0] !== 2n, openTime));

          // Tick: oracle address
          case "oracle":
            return Promise.resolve(ORACLE);

          // Tick: current price (safely away from liquidation)
          case "getPrice":
            return Promise.resolve(CURRENT_PRICE);

          // Tick: on-chain duration
          case "duration":
            return Promise.resolve(DURATION);

          default:
            return Promise.resolve(0n);
        }
      }),

      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success" as const,
        blockNumber: 42n,
      }),

      // Not needed in this test path (bootstrap + tick only), but must exist.
      watchContractEvent: vi.fn().mockReturnValue(() => {}),
    };

    // ── walletClient mock ──────────────────────────────────────────────────
    walletClient = {
      writeContract: vi.fn().mockResolvedValue(TX_HASH),
    };

    // Minimal config — real RPC/chain values are irrelevant because clients
    // are injected, so we just need the address and block fields.
    bot = new KeeperBot(
      {
        rpcUrl: "http://localhost:8545",
        wsUrl: undefined,
        privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        binaryAddress: BINARY,
        fromBlock: 0n,
        pollIntervalMs: 1000,
        chain: {
          id: 1,
          name: "test",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: ["http://localhost:8545"] } },
        },
      },
      { publicClient, walletClient }
    );
  });

  it("settles all three positions after they have been open for 120 seconds", async () => {
    await bot.bootstrap();
    await bot.tick();

    // Every position must have been settled exactly once.
    expect(walletClient.writeContract).toHaveBeenCalledTimes(3);

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "settle", args: [0n] })
    );
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "settle", args: [1n] })
    );
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "settle", args: [2n] })
    );
  });

  it("removes settled positions from the open set after settle succeeds", async () => {
    await bot.bootstrap();

    // Access openPositions via the protected property (test subclass trick).
    const open = (bot as unknown as { openPositions: Map<bigint, unknown> })
      .openPositions;

    expect(open.size).toBe(3);

    await bot.tick();

    expect(open.size).toBe(0);
  });

  it("does not call settle for positions that were already settled at bootstrap", async () => {
    // Override getContractEvents so that position #1 is already in the settled log.
    (publicClient.getContractEvents as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([
        openedLogArgs(0n, true),
        openedLogArgs(1n, true),
        openedLogArgs(2n, false),
      ])
      .mockResolvedValueOnce([
        // Position #1 was settled before the keeper started.
        { args: { id: 1n, settler: BINARY, payout: 0n, exitPrice: CURRENT_PRICE } },
      ]);

    await bot.bootstrap();
    await bot.tick();

    // Only positions #0 and #2 should be settled.
    expect(walletClient.writeContract).toHaveBeenCalledTimes(2);
    expect(walletClient.writeContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ args: [1n] })
    );
  });

  it("does not settle positions that are less than 120 seconds old and not liquidated", async () => {
    // Override: positions were opened only 60 seconds ago (not yet expired).
    const recentOpenTime = nowSec() - 60n;

    (publicClient.getContractEvents as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValueOnce([
        openedLogArgs(0n, true),
        openedLogArgs(1n, false),
      ])
      .mockResolvedValueOnce([]);

    (publicClient.readContract as ReturnType<typeof vi.fn>).mockImplementation(
      ({ functionName, args }) => {
        switch (functionName) {
          case "positions":
            return Promise.resolve(positionTuple(args[0] !== 1n, recentOpenTime));
          case "oracle":
            return Promise.resolve(ORACLE);
          case "getPrice":
            // Price is safe — no liquidation.
            return Promise.resolve(CURRENT_PRICE);
          case "duration":
            return Promise.resolve(DURATION);
          default:
            return Promise.resolve(0n);
        }
      }
    );

    await bot.bootstrap();
    await bot.tick();

    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });
});
