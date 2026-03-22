# Keeper Role: Liquidation Guide

## 1. What is a Keeper?

In the Binary protocol, the **keeper** is a bot or script operated by the protocol owner that monitors open positions and calls `settle(id)` when a position has crossed its liquidation price.

Unlike many DeFi protocols, `settle()` is **not permissionless** — only the position's trader or the contract **owner** can call it. This means the keeper must be run by the owner's key. The trader can also self-settle at any time.

---

## 2. Why Liquidation Exists

Positions are opened with 100x leverage. A small adverse price move amplifies into a large loss relative to the trader's stake:

- Trader deposits 1 USDC as margin.
- 100x leverage means exposure to 100 USDC of notional value.
- A 0.5% adverse move wipes out the full margin.

Without a keeper, a position sitting past its liquidation price would continue to accrue theoretical losses that already exceed the trader's stake, creating an accounting inconsistency in the vault. Liquidation resolves the position cleanly: the trader's stake stays in the vault as LP yield and the locked LP capital is freed.

---

## 3. Liquidation Price

At the moment a position is opened, the contract computes and stores a `liquidationPrice`:

```
// Long position
liqPrice = entryPrice - entryPrice / (2 * LEVERAGE)
         = entryPrice * (1 - 1/200)
         ≈ entryPrice * 0.995   (−0.5%)

// Short position
liqPrice = entryPrice + entryPrice / (2 * LEVERAGE)
         = entryPrice * (1 + 1/200)
         ≈ entryPrice * 1.005   (+0.5%)
```

This value is stored in `positions[id].liquidationPrice` and emitted in the `PositionOpened` event.

**Numeric example** with entryPrice = 2000 USDC (e.g. ETH):

| Direction | Entry | Liq price | Adverse move needed |
|---|---|---|---|
| Long | 2000 | 1990 | −0.5% |
| Short | 2000 | 2010 | +0.5% |

---

## 4. The Payout Formula

`settle()` internally calls `_calculatePayout`:

```
favorable = price move in the trader's favor
adverse   = price move against the trader

gain = stake * LEVERAGE * favorable / entryPrice
loss = stake * LEVERAGE * adverse   / entryPrice

payout = stake + gain − loss    // if loss * 2 < stake
payout = 0                      // if loss * 2 >= stake  ← liquidation
```

The liquidation condition `loss * 2 >= stake` is mathematically equivalent to the exit price crossing `liquidationPrice`. No separate check is needed — settling at any price beyond the liquidation threshold always results in `payout = 0`.

---

## 5. What Happens During Liquidation

When `settle(id)` is called and `payout == 0`:

1. `positions[id].settled` is set to `true`.
2. `vault.releaseLiquidity(lockedAmount, address(vault), 0)` is called:
   - `lockedAssets` decreases by `stake * LEVERAGE` — freeing vault capacity.
   - The trader's stake, which was already transferred into the vault at open, **remains in the vault** as yield for LP shareholders.
   - No tokens are transferred out.
3. `PositionSettled(id, settler, payout=0, exitPrice)` is emitted.

The LP vault benefits from every liquidated position: the protocol fee (paid at open) and the full stake are absorbed.

---

## 6. Keeper Responsibilities

### 6.1 Track Open Positions

Listen for `PositionOpened` events on the `Binary` contract:

```
event PositionOpened(
    uint256 indexed id,
    address indexed trader,
    bool    isLong,
    uint256 stake,
    uint256 lockedAmount,
    uint256 entryPrice,
    uint256 liquidationPrice   // ← store this
)
```

Maintain a local index: `{ id, isLong, liquidationPrice, settled: false }`.

Remove positions from the index when `PositionSettled` is observed (trader self-settled or already liquidated).

### 6.2 Monitor the Oracle Price

Poll `oracle().getPrice()` at a frequency appropriate to market volatility. With 100x leverage and a 0.5% liquidation threshold, **price can cross the threshold in a single block during high volatility**.

You can read the active oracle address from `ConfigurationManager`:
```
configManager.getConfig(configManager.ORACLE())  // returns bytes32 address
```

### 6.3 Detect Liquidatable Positions

For each open position in your index:

```
// Long: liquidation when price falls to or below liqPrice
if isLong  && currentPrice <= position.liquidationPrice → liquidate

// Short: liquidation when price rises to or above liqPrice
if !isLong && currentPrice >= position.liquidationPrice → liquidate
```

You can also call `binary.currentPayout(id)` — it returns `0` for a currently-liquidatable position without sending a transaction.

### 6.4 Call settle()

When a position is liquidatable, submit:

```solidity
binary.settle(id)
```

**Requirements:**
- `msg.sender` must be the position's trader **or** the contract owner.
- As a keeper you must call from the **owner's address**.
- `positions[id].settled` must be `false`.
- `oracle().getPrice()` must return a non-zero value at execution time (oracle liveness check).

There is **no time lock** — positions can be settled immediately after open if the liquidation price is crossed.

---

## 7. Edge Cases to Handle

| Scenario | What to do |
|---|---|
| Oracle price bounces back before your tx lands | `settle()` will still execute; `payout` will be non-zero (partial loss, not full liquidation). That is fine — the position settles at the actual exit price. |
| Position was already settled by the trader | `settle()` reverts with `"Binary: already settled"`. Catch this and remove from index. |
| Oracle returns 0 | `settle()` reverts with `"Binary: invalid oracle price"`. Retry when oracle recovers. |
| Protocol is paused | `settle()` is **not** blocked by `pause()` — you can always settle existing positions. |
| Multiple positions liquidatable at once | Batch calls in a single script loop. No on-chain batching is provided; each `settle(id)` is a separate transaction. |

---

## 8. Suggested Keeper Loop

```
every N seconds:
  currentPrice = oracle.getPrice()

  for each position in openPositions:
    if isLiquidatable(position, currentPrice):
      try binary.settle(position.id) as owner
      on success:  remove from openPositions
      on revert "already settled":  remove from openPositions
      on revert "invalid oracle price":  skip, retry next cycle
```

Poll interval recommendation: ≤ 1 second on Monad (0.5 s block time). Use a WebSocket subscription to `PositionOpened` events to avoid missing positions opened between polling cycles.

---

## 9. Summary

| Question | Answer |
|---|---|
| Who can call `settle()`? | Only the position's trader or the contract owner |
| When is a position liquidatable? | When `currentPrice` crosses `liquidationPrice` (stored at open) |
| What triggers liquidation vs. normal settlement? | `_calculatePayout` returns 0 when adverse move ≥ 0.5% at 100x |
| Does the keeper earn a fee? | No — there is no keeper fee in the current implementation |
| What happens to the stake on liquidation? | Remains in `LiquidityVault` as LP yield |
| Is there a time lock before settle can be called? | No — settle is callable at any time after open |
