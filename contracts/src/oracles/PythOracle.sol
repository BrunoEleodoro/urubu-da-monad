// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IOracle} from "../interfaces/IOracle.sol";

/// @dev Minimal Pyth price struct.
struct PythPrice {
    int64  price;
    uint64 conf;
    int32  expo;
    uint   publishTime;
}

/// @dev Minimal Pyth interface — only the methods this oracle uses.
interface IPyth {
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (PythPrice memory);
}

/// @title PythOracle
/// @notice Wraps a Pyth Network price feed into the IOracle interface.
///         Converts Pyth's (price, expo) representation into a plain integer scaled
///         to `TARGET_DECIMALS` (e.g. 6 for USDC, 18 for WAD).
contract PythOracle is IOracle {
    IPyth   public immutable PYTH;
    bytes32 public immutable PRICE_ID;
    uint256 public immutable MAX_AGE;
    uint8   public immutable TARGET_DECIMALS;

    /// @param _pyth           Pyth contract address on the target chain.
    /// @param _priceId        Pyth price feed ID (e.g. ETH/USD).
    /// @param _maxAge         Maximum acceptable age of the price in seconds.
    /// @param _targetDecimals Decimal precision of the returned price (e.g. 6 for USDC).
    constructor(address _pyth, bytes32 _priceId, uint256 _maxAge, uint8 _targetDecimals) {
        require(_pyth != address(0), "PythOracle: zero pyth");
        require(_priceId != bytes32(0), "PythOracle: zero priceId");
        require(_maxAge > 0, "PythOracle: zero maxAge");

        PYTH            = IPyth(_pyth);
        PRICE_ID        = _priceId;
        MAX_AGE         = _maxAge;
        TARGET_DECIMALS = _targetDecimals;
    }

    /// @notice Returns the latest Pyth price scaled to `TARGET_DECIMALS`.
    /// @dev Reverts if the price is stale or non-positive.
    function getPrice() external view returns (uint256) {
        PythPrice memory p = PYTH.getPriceNoOlderThan(PRICE_ID, MAX_AGE);
        require(p.price > 0, "PythOracle: non-positive price");
        return _scale(uint64(p.price), p.expo, TARGET_DECIMALS);
    }

    /// @notice Returns true when a fresh price is available within `MAX_AGE`.
    function hasEnoughHistory() external view returns (bool) {
        try PYTH.getPriceNoOlderThan(PRICE_ID, MAX_AGE) returns (PythPrice memory p) {
            return p.price > 0;
        } catch {
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Converts a Pyth (price, expo) pair to an integer with `decimals` precision.
    ///      Pyth represents value as price × 10^expo.  We want price × 10^(-TARGET_DECIMALS).
    ///      The net exponent shift is (expo + TARGET_DECIMALS).
    function _scale(uint64 price, int32 expo, uint8 decimals) private pure returns (uint256) {
        int32 shift = expo + int32(uint32(decimals));
        if (shift >= 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            return uint256(price) * (10 ** uint32(shift));
        } else {
            // forge-lint: disable-next-line(unsafe-typecast)
            return uint256(price) / (10 ** uint32(-shift));
        }
    }
}
