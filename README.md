<p align="center">
  <img src="frontend/public/game/logo-wordmark.png" alt="Urubu da Monad" width="280" />
</p>

# Urubu da Monad

[Portuguese version](./README.pt-BR.md)

Trading mini app for Farcaster + Monad.

This project connects a Next.js frontend to onchain binary trading contracts, passkey-based embedded wallets, server-side protocol routes, and BRL ramp flows via Orda.

## Tech stack

| Layer | Tech stack | What it is used for |
| --- | --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, CSS Modules | Game UI, trading screen, wallet UI, passkeys, ramp flows |
| State and data | TanStack Query, Zod | Caching, onchain snapshot refetch, payload validation |
| Onchain client | viem, wagmi | Contract reads and writes, `approve`, `openPosition`, `settle` |
| Farcaster | `@farcaster/miniapp-sdk`, `@farcaster/miniapp-wagmi-connector` | Mini app runtime, Farcaster context, wallet connection |
| App backend | Next.js Route Handlers | Internal APIs for protocol snapshot, passkey session, quotes and status |
| Passkeys | webauthx, server cookies | Wallet creation/authentication and server-side signing |
| Fiat ramp | `@ordanetwork/sdk` | BRL/PIX on-ramp and off-ramp |
| OG/image | `@vercel/og` | Social image generation |
| Smart contracts | Solidity 0.8.20, Foundry, OpenZeppelin | `Binary`, `LiquidityVault`, `ConfigurationManager`, oracle contracts |
| Oracle | Pyth, Uniswap V3 TWAP, Uniswap V4 spot | Price source for opening and settling positions |
| Keeper | Node.js, TypeScript, viem, Vitest | Bot that monitors positions and calls `settle()` |

## Project structure

- `frontend/`: Next.js app with UI, API routes, and integrations with Farcaster, passkeys, Orda, and the protocol.
- `contracts/`: Solidity contracts, deployment scripts, and Foundry tests.
- `keeper/`: separate bot that watches contract events and executes settlement/liquidation.

## Backend in one sentence

The backend lives inside the Next.js app through `app/api/*`, with no traditional database: the main state comes from the blockchain, and the passkey wallet session is stored in signed server cookies.

## Main backend integrations

- `/api/protocol/*`: protocol snapshot and active position recovery.
- `/api/passkeys/*`: registration, login, session, transfer, and protocol contract actions.
- `/api/orda/*`: quote creation and status tracking for on-ramp and off-ramp.
- `/api/og`: dynamic Open Graph image generation.

## Main contracts

- `Binary`: opens and settles long/short positions.
- `LiquidityVault`: ERC4626 vault that holds protocol liquidity.
- `ConfigurationManager`: stores oracle, fee, duration, and limit configuration.
- `PythOracle`, `UniswapTWAPOracle`, `UniswapV4Oracle`: oracle implementations.

## Running locally

### Frontend

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

### Contracts

```bash
cd contracts
forge build
forge test
```

### Keeper

```bash
cd keeper
npm install
npm run start
```

## Important environment variables

- `NEXT_PUBLIC_URL`: public mini app URL
- `PASSKEY_WALLET_SECRET`: secret used to seal the passkey session
- `PASSKEY_RP_ID` and `PASSKEY_ORIGIN`: WebAuthn configuration
- `ORDA_CLIENT_ID` and `ORDA_CLIENT_SECRET`: Orda credentials
- `FARCASTER_HEADER`, `FARCASTER_PAYLOAD`, `FARCASTER_SIGNATURE`: Farcaster mini app association values

## Summary

This repo is a simple monorepo with three pieces:

- a Next.js app for frontend + backend
- Solidity contracts with Foundry
- a TypeScript keeper for protocol operations
