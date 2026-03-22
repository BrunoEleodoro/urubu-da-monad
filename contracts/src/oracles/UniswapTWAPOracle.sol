// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OracleLibrary} from "../vendor/OracleLibrary.sol";
import {IUniswapV3PoolMinimal} from "../vendor/IUniswapV3PoolMinimal.sol";
import {IOracle} from "../interfaces/IOracle.sol";

/// @title UniswapTWAPOracle
/// @notice Stateless helper that wraps a Uniswap V3 pool observation into a clean price interface.
contract UniswapTWAPOracle is IOracle {
    IUniswapV3PoolMinimal public immutable pool;
    uint32 public immutable twapPeriod;
    address public immutable baseToken;
    address public immutable quoteToken;
    uint128 public immutable baseAmount;

    constructor(
        address _pool,
        uint32 _twapPeriod,
        address _baseToken,
        address _quoteToken,
        uint128 _baseAmount
    ) {
        require(_pool != address(0), "Invalid pool");
        require(_twapPeriod > 0, "Invalid period");
        require(_baseToken != address(0) && _quoteToken != address(0), "Invalid tokens");
        require(_baseAmount > 0, "Invalid base amount");

        pool = IUniswapV3PoolMinimal(_pool);
        twapPeriod = _twapPeriod;
        baseToken = _baseToken;
        quoteToken = _quoteToken;
        baseAmount = _baseAmount;
    }

    /// @notice Returns the TWAP price as quoteToken amount per baseAmount of baseToken.
    function getPrice() external view returns (uint256) {
        (int24 tick,) = OracleLibrary.consult(address(pool), twapPeriod);
        return OracleLibrary.getQuoteAtTick(tick, baseAmount, baseToken, quoteToken);
    }

    /// @notice Returns false if the pool lacks sufficient observation history for twapPeriod.
    function hasEnoughHistory() external view returns (bool) {
        uint32 oldestObservation = OracleLibrary.getOldestObservationSecondsAgo(address(pool));
        return oldestObservation >= twapPeriod;
    }
}
