# Specification: How Leverage, Long/Short, and Liquidation Price Work

Explain the concepts below in a simple, didactic way for a beginner.

## 1. Leverage
Leverage means using a small amount of your own capital as margin to control a larger position.

Example:
- Margin: 1 USD
- Leverage: 100x
- Position size: 100 USD

Formula:
- `positionSize = margin * leverage`

This means 1 USD with 100x leverage gives exposure to 100 USD.

## 2. Long Position
A long position means the trader profits if the asset price goes up.

Example:
- Margin: 1 USD
- Leverage: 100x
- Entry price: 100 USD
- Position size: 100 USD
- Quantity: `100 / 100 = 1 unit`

### Long profit example
If price goes from 100 USD to 101 USD:
- Price change: +1%
- PnL: `100 USD * 1% = +1 USD`

Result:
- Initial margin: 1 USD
- Profit: 1 USD
- Final equity: 2 USD

### Long loss example
If price goes from 100 USD to 99 USD:
- Price change: -1%
- PnL: `100 USD * -1% = -1 USD`

Result:
- Initial margin: 1 USD
- Loss: 1 USD
- Final equity: 0 USD

## 3. Short Position
A short position means the trader profits if the asset price goes down.

Example:
- Margin: 1 USD
- Leverage: 100x
- Entry price: 100 USD
- Position size: 100 USD
- Quantity: `100 / 100 = 1 unit`

### Short profit example
If price goes from 100 USD to 99 USD:
- Price change: -1%
- PnL: `100 USD * 1% = +1 USD`

Result:
- Initial margin: 1 USD
- Profit: 1 USD
- Final equity: 2 USD

### Short loss example
If price goes from 100 USD to 101 USD:
- Price change: +1%
- PnL: `100 USD * -1% = -1 USD`

Result:
- Initial margin: 1 USD
- Loss: 1 USD
- Final equity: 0 USD

## 4. PnL Formula
Use the idea that profit and loss is based on the total position size, not only on the trader's margin.

### Generic form
- `PnL = positionSize * priceChangePercent`

### Alternative form using quantity
For long:
- `PnL = quantity * (currentPrice - entryPrice)`

For short:
- `PnL = quantity * (entryPrice - currentPrice)`

## 5. Liquidation Price
Liquidation happens when the trader's remaining equity is no longer enough to satisfy the maintenance margin required by the platform.

Important:
- Exchanges usually liquidate based on **mark price**, not necessarily the last traded price.
- In practice, liquidation may happen before the trader loses 100% of the margin because of:
    - maintenance margin
    - liquidation fees
    - exchange rules

## 6. Simplified Liquidation Model
Use a simplified isolated-margin model with:
- Margin: 1 USD
- Entry price: 100 USD
- Leverage: 100x
- Position size: 100 USD
- Quantity: 1 unit
- Maintenance margin: 0.50 USD

This means the trader can only lose:
- `1.00 - 0.50 = 0.50 USD`

## 7. Liquidation Price Formula

### Long
Liquidation occurs when:
- `margin + unrealizedPnL = maintenanceMargin`

Since for long:
- `unrealizedPnL = quantity * (liqPrice - entryPrice)`

Then:
- `liqPrice = entryPrice - (margin - maintenanceMargin) / quantity`

### Short
Since for short:
- `unrealizedPnL = quantity * (entryPrice - liqPrice)`

Then:
- `liqPrice = entryPrice + (margin - maintenanceMargin) / quantity`

## 8. Numeric Liquidation Examples with 1 USD

### 100x Long
- Margin: 1 USD
- Entry price: 100 USD
- Position size: 100 USD
- Quantity: 1
- Maintenance margin: 0.50 USD

Formula:
- `liqPrice = 100 - (1 - 0.50) / 1`
- `liqPrice = 99.50 USD`

Interpretation:
- If price falls from 100 USD to 99.50 USD, the position reaches liquidation.

### 100x Short
- Margin: 1 USD
- Entry price: 100 USD
- Position size: 100 USD
- Quantity: 1
- Maintenance margin: 0.50 USD

Formula:
- `liqPrice = 100 + (1 - 0.50) / 1`
- `liqPrice = 100.50 USD`

Interpretation:
- If price rises from 100 USD to 100.50 USD, the position reaches liquidation.

## 9. Quick Intuition
With high leverage, small price moves create large percentage changes in the trader's equity.

Using the simplified model:
- 5x leverage -> liquidation after about 10% adverse move
- 10x leverage -> liquidation after about 5% adverse move
- 20x leverage -> liquidation after about 2.5% adverse move
- 50x leverage -> liquidation after about 1% adverse move
- 100x leverage -> liquidation after about 0.5% adverse move
