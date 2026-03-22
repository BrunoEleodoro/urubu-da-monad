# Binary — Leveraged Trading Protocol — Implementation Specification

## Project Objective

Build a decentralized, permissionless leveraged trading protocol where traders open a long or short position on a crypto asset with 100x leverage. A 1% adverse price move fully liquidates the position; favorable moves yield proportional gains up to the locked LP capital. The protocol uses an external ERC4626 vault (`LiquidityVault`) as the sole counterparty to all trades. Trader funds and LP funds are strictly separate accounting buckets. The protocol is non-custodial and fully on-chain.

---

## Actors

| Actor | Description | Permissions |
|---|---|---|
| **Trader** | Opens long/short positions by depositing ERC20 tokens. Claims payout at settlement based on price movement. | `openPosition()`, `settle()` |
| **Liquidity Provider (LP)** | Deposits ERC20 tokens into the vault explicitly as counterparty capital. Earns yield from protocol fees and liquidated/losing stakes. Bears loss from winning trades. Receives ERC4626 shares in return. | `deposit()`, `withdraw()`, `mint()`, `redeem()` (standard ERC4626) |
| **Protocol Owner** | Deploys contracts, updates configuration parameters via `ConfigurationManager`, can pause the system. Does not touch user or LP funds directly. | `configManager.set(...)`, `pause()`, `unpause()` |
| **Oracle** | Provides current asset price at position open and settlement. Fully on-chain. Three implementations available: Pyth, Uniswap V3 TWAP, Uniswap V4 spot. | Read-only via `IOracle` |

> **Note:** There is no permissionless keeper role. `settle()` is restricted to the position's trader or the contract owner.

---

## Tooling

| Layer | Tool | Reason |
|---|---|---|
| Language | Solidity ^0.8.20 | Current stable, built-in overflow protection |
| Framework | Foundry | Fast tests, fuzzing, script-based deployment |
| Base contracts | OpenZeppelin v5 | ERC4626, ERC20, Ownable, ReentrancyGuard, Pausable, SafeERC20 |
| Oracle (default) | Pyth Network | Off-chain price aggregation with on-chain verification and freshness guarantee |
| Oracle (alt) | Uniswap V3 TWAP | Fully on-chain, `OracleLibrary.consult()` + `getQuoteAtTick()` |
| Oracle (alt) | Uniswap V4 spot | Reads current tick from V4 StateView; no TWAP available |
| Frontend | Next.js + wagmi v2 + RainbowKit | Standard DeFi stack |

---

## Contracts

### `ConfigurationManager`

Owner-controlled key/value store. Both `Binary` and `LiquidityVault` read their runtime configuration from here, allowing parameter updates without redeployment.

**Keys (bytes32 constants):**
| Key | Type | Description |
|---|---|---|
| `MAX_PAYOUT` | `uint256` | Maximum stake per position in asset units (net of fee) |
| `MAX_UTILIZATION_BPS` | `uint256` | Max % of vault free assets lockable at any time (e.g. `8000` = 80%) |
| `ORACLE` | `address` | Active `IOracle` implementation |
| `VAULT_CONTROLLER` | `address` | Address authorized to call `lockLiquidity`/`releaseLiquidity` on the vault (i.e. `Binary`) |
| `FEE_BPS` | `uint256` | Protocol fee in basis points taken from gross amount at open |
| `DURATION` | `uint256` | Position duration (currently unused in settle; reserved for future time-lock) |

**Functions:**
- `set(bytes32 key, bytes32 value)` — owner only; emits `ConfigSet(key, value)`
- `getConfig(bytes32 key) → bytes32` — public view

---

### `LiquidityVault` (ERC4626)

Holds all protocol funds — both LP capital and trader stakes in-flight. Is the sole counterparty to every trade. Only the controller address (read from `ConfigurationManager`) can lock/release liquidity.

**Constructor params:**
- `IERC20 asset_` — underlying ERC20 (e.g. USDC)
- `string name_` — vault share token name (e.g. `"Liquidity Vault"`)
- `string symbol_` — vault share token symbol (e.g. `"lvUSDC"`)
- `ConfigurationManager configManager_` — configuration store

**Storage:**
- `uint256 lockedAssets` — sum of all outstanding locked amounts (stake × LEVERAGE) currently reserved
- `ConfigurationManager configManager` — immutable reference to config store

**Functions:**
- `totalAssets() override → uint256` — returns `balance - lockedAssets`; ensures share price excludes locked funds
- `lockLiquidity(uint256 amount)` — controller only; increments `lockedAssets`; reverts if `balance < lockedAssets + amount`
- `releaseLiquidity(uint256 locked, address recipient, uint256 payout)` — controller only; decrements `lockedAssets`; transfers `payout` to `recipient` if `recipient` is not `address(this)` or `address(0)`

**Inflation attack mitigation:**
- `_decimalsOffset()` returns `6` — uses OZ's virtual shares mechanism; no seed deposit required

**Invariants:**
- `lockedAssets` must never exceed `IERC20(asset).balanceOf(address(this))`
- `totalAssets()` returns 0 rather than underflowing

**Events:**
```
LiquidityLocked(uint256 amount)
LiquidityReleased(uint256 locked, address indexed recipient, uint256 payout)
```

---

### `Binary`

Core logic contract. Manages position lifecycle (open and settle). Reads all configuration from `ConfigurationManager`. Protocol fees flow directly into `LiquidityVault` as LP yield; no separate fee recipient.

**Constructor params:**
- `address _configManager` — deployed `ConfigurationManager`
- `address _vault` — deployed `LiquidityVault`

**Constants:**
- `LEVERAGE = 100` — position leverage; a 1% adverse move fully liquidates the position

**Config views (reads from ConfigurationManager at call time):**
- `oracle() → IOracle`
- `maxPayout() → uint256`
- `maxUtilizationBps() → uint256`
- `feeBps() → uint256`
- `duration() → uint256`
- `asset() → IERC20`

**Position struct:**
```solidity
struct Position {
    address trader;
    bool    isLong;
    uint256 stake;            // net of protocol fee
    uint256 entryPrice;       // oracle price at open
    uint256 liquidationPrice; // price at which the entire stake is lost
    uint256 openTime;         // block.timestamp at open
    bool    settled;
}
```

**Functions:**

`openPosition(bool isLong, uint256 amount) → uint256 id`
1. Pull `amount` from trader via `safeTransferFrom`
2. If `feeBps > 0`: compute `fee = amount * feeBps / 10000`; transfer `fee` directly to vault (LP yield)
3. Set `stake = amount - fee`
4. Check `stake <= maxPayout()`
5. Compute `lockedAmount = stake * LEVERAGE`
6. Check vault utilization: `vault.lockedAssets() + lockedAmount <= vault.totalAssets() * maxUtilizationBps / 10000`
7. Transfer `stake` to vault via `safeTransfer`
8. Fetch `entryPrice = oracle().getPrice()`; revert if `0`
9. Compute liquidation price:
   - Long: `liqPrice = entryPrice - entryPrice / (2 * LEVERAGE)`
   - Short: `liqPrice = entryPrice + entryPrice / (2 * LEVERAGE)`
10. Call `vault.lockLiquidity(lockedAmount)`
11. Store position, emit `PositionOpened`

`settle(uint256 id)`
1. Load position; revert if not found, already settled, or `msg.sender` is neither the trader nor the owner
2. Fetch `exitPrice = oracle().getPrice()`; revert if `0`
3. Mark `settled = true` before external calls (reentrancy guard)
4. Compute `payout = _calculatePayout(pos, exitPrice)` (see below)
5. If `payout > 0`: `vault.releaseLiquidity(lockedAmount, trader, payout)`
6. If `payout == 0` (liquidated): `vault.releaseLiquidity(lockedAmount, address(vault), 0)` — entire stake remains in vault as LP yield
7. Emit `PositionSettled`

**Payout calculation** (`_calculatePayout`):
```
gain = stake * LEVERAGE * favorableMove / entryPrice
loss = stake * LEVERAGE * adverseMove  / entryPrice
payout = stake + gain - loss   (clamped to 0 if loss * 2 >= stake)
```
- Full liquidation condition: `loss * 2 >= stake` (approximately when adverse move ≥ 1/LEVERAGE = 1%)
- At `exitPrice == entryPrice`: gain = 0, loss = 0, payout = stake (full refund)

**View functions:**
- `currentPayout(uint256 id) → uint256` — simulates settlement at current oracle price; returns 0 for non-existent or settled positions
- `liquidationPrice(uint256 id) → uint256` — returns stored liquidation price

**Admin functions (owner only):**
- `pause()` — blocks `openPosition`; `settle` remains callable while paused
- `unpause()`
- Configuration updates go through `configManager.set(...)` directly (no per-parameter setters on `Binary`)

**Events:**
```
PositionOpened(
    uint256 indexed id,
    address indexed trader,
    bool    isLong,
    uint256 stake,
    uint256 lockedAmount,
    uint256 entryPrice,
    uint256 liquidationPrice
)

PositionSettled(
    uint256 indexed id,
    address indexed settler,
    uint256 payout,
    uint256 exitPrice
)
```

---

### Oracle Implementations

All oracles implement `IOracle`:
```solidity
interface IOracle {
    function getPrice() external view returns (uint256);
    function hasEnoughHistory() external view returns (bool);
}
```

#### `PythOracle` *(default — used by Deploy.s.sol)*

Wraps a Pyth Network price feed. Converts Pyth's `(price, expo)` representation to a plain integer at `targetDecimals` precision. Validates freshness via `maxAge`.

**Constructor params:**
- `address _pyth` — Pyth contract on target chain
- `bytes32 _priceId` — Pyth price feed ID (e.g. ETH/USD)
- `uint256 _maxAge` — maximum acceptable price age in seconds
- `uint8 _targetDecimals` — decimal precision of returned price (e.g. 6 for USDC)

**Functions:**
- `getPrice() → uint256` — calls `getPriceNoOlderThan`; reverts if stale or price ≤ 0; scales to `targetDecimals`
- `hasEnoughHistory() → bool` — returns true if a fresh price is available within `maxAge`

#### `UniswapTWAPOracle`

Stateless wrapper around a Uniswap V3 pool observation.

**Constructor params:**
- `address _pool` — Uniswap V3 pool
- `uint32 _twapPeriod` — lookback window in seconds (recommended: 300 = 5 min)
- `address _baseToken` — token being priced
- `address _quoteToken` — denomination token
- `uint128 _baseAmount` — 1 unit of base token (e.g. `1e18` for WETH)

**Functions:**
- `getPrice() → uint256` — `OracleLibrary.consult()` + `getQuoteAtTick()`
- `hasEnoughHistory() → bool` — true if oldest observation ≥ `twapPeriod`

#### `UniswapV4Oracle`

Spot-price oracle backed by a Uniswap V4 pool. Reads current tick from the V4 `StateView` contract. No TWAP available in V4.

**Constructor params:**
- `address _stateView` — Uniswap V4 StateView contract
- `bytes32 _poolId` — `keccak256` of the PoolKey
- `address _baseToken` — token being priced (may be `address(0)` for native assets, e.g. MON on Monad)
- `address _quoteToken` — denomination token
- `uint128 _baseAmount` — 1 unit of base token

**Functions:**
- `getPrice() → uint256` — reads `stateView.getSlot0(poolId)` tick; converts via `OracleLibrary.getQuoteAtTick()`
- `hasEnoughHistory() → bool` — true if `sqrtPriceX96 > 0` (pool is initialized)

---

## Deployment Order

1. Deploy `PythOracle` (or another `IOracle` implementation) with appropriate params
2. Verify `oracle.hasEnoughHistory()` returns `true`
3. Deploy `ConfigurationManager`
4. Deploy `LiquidityVault` with asset, name, symbol, and `configManager`
5. Deploy `Binary` with `configManager` and `vault`
6. Configure `ConfigurationManager`:
   - `VAULT_CONTROLLER` → `address(binary)`
   - `ORACLE` → `address(oracle)`
   - `MAX_PAYOUT` → max stake per position
   - `MAX_UTILIZATION_BPS` → e.g. `8000`
   - `FEE_BPS` → e.g. `200` (2%)
   - `DURATION` → e.g. `120`
7. *(Optional)* Seed vault with initial LP deposit to prevent inflation attack — though `_decimalsOffset = 6` already mitigates this

---

## Security Invariants

- Trader funds never become counterparty capital — stake transfers directly to vault and is accounted separately from LP shares
- Protocol fees (sent to vault at open) immediately accrue to LP shareholders via share price
- `lockedAssets` always ≤ vault token balance
- `settle()` is restricted to the position's trader or the contract owner — not permissionless
- `settled = true` is set before any external call (reentrancy protection)
- No admin function can move user funds or LP funds
- `pause()` only blocks new position opens; existing positions always settleable
- All configuration updates go through `ConfigurationManager`; no parameter is hardcoded in `Binary`

---

## Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Pyth price staleness | `maxAge` parameter; `getPriceNoOlderThan` reverts on stale data |
| Low-liquidity pool TWAP manipulation (V3 oracle) | Deploy only against deep pools; use ≥5 min TWAP period |
| Observation cardinality too low (V3) | `hasEnoughHistory()` check before use |
| Uniswap V4 spot price manipulation | Spot prices are susceptible to intra-block manipulation; use only with caution |
| Vault over-utilization | `maxUtilizationBps` cap enforced at every `openPosition` |
| ERC4626 inflation attack | `_decimalsOffset() = 6` (virtual shares) mitigates without seed deposit |
| Reentrancy on settle | `settled = true` before any external call; `ReentrancyGuard` on both `openPosition` and `settle` |
| No permissionless keeper | `settle` is restricted to trader or owner; owner must act as backstop for expired positions |
| Oracle returns 0 | Explicit `require(price > 0)` guard in both `openPosition` and `settle` |
