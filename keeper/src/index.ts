import "dotenv/config";
import { type Address, type Chain } from "viem";
import { KeeperBot } from "./keeper.js";

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional_env(key: string): string | undefined {
  return process.env[key] || undefined;
}

// Minimal chain definition — override with your target chain if needed.
// Monad mainnet is used by default based on the contract .env.template.
const monad: Chain = {
  id: 41454,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [require_env("RPC_URL")] },
  },
};

const privateKey = require_env("KEEPER_PRIVATE_KEY");
if (!privateKey.startsWith("0x")) {
  throw new Error("KEEPER_PRIVATE_KEY must be a 0x-prefixed hex string");
}

const config = {
  rpcUrl: require_env("RPC_URL"),
  wsUrl: optional_env("WS_URL"),
  privateKey: privateKey as `0x${string}`,
  binaryAddress: require_env("BINARY_ADDRESS") as Address,
  fromBlock: BigInt(optional_env("FROM_BLOCK") ?? "0"),
  pollIntervalMs: Number(optional_env("POLL_INTERVAL_MS") ?? "1000"),
  chain: monad,
};

const bot = new KeeperBot(config);

process.on("SIGINT", () => {
  console.log("\n[keeper] shutting down...");
  process.exit(0);
});

bot.start().catch((err) => {
  console.error("[keeper] fatal:", err);
  process.exit(1);
});
