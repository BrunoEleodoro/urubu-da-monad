export const BINARY_ABI = [
  {
    type: "function",
    name: "oracle",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "currentPayout",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "positions",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "trader", type: "address" },
      { name: "isLong", type: "bool" },
      { name: "stake", type: "uint256" },
      { name: "entryPrice", type: "uint256" },
      { name: "liquidationPrice", type: "uint256" },
      { name: "openTime", type: "uint256" },
      { name: "settled", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "duration",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "settle",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "PositionOpened",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "isLong", type: "bool", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
      { name: "lockedAmount", type: "uint256", indexed: false },
      { name: "entryPrice", type: "uint256", indexed: false },
      { name: "liquidationPrice", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PositionSettled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "settler", type: "address", indexed: true },
      { name: "payout", type: "uint256", indexed: false },
      { name: "exitPrice", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

export const ORACLE_ABI = [
  {
    type: "function",
    name: "getPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasEnoughHistory",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;
