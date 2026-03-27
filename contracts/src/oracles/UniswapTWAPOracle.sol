// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OracleLibrary} from "../vendor/OracleLibrary.sol";
import {IUniswapV3PoolMinimal} from "../vendor/IUniswapV3PoolMinimal.sol";
import {IOracle} from "../interfaces/IOracle.sol";

/// @title UniswapTWAPOracle
/// @notice Stateless helper that wraps a Uniswap V3 POOL observation into a clean price interface.
contract UniswapTWAPOracle is IOracle {
    IUniswapV3PoolMinimal public immutable POOL;
    uint32 public immutable TWAP_PERIOD;
    address public immutable BASE_TOKEN;
    address public immutable QUOTE_TOKEN;
    uint128 public immutable BASE_AMOUNT;

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

        POOL        = IUniswapV3PoolMinimal(_pool);
        TWAP_PERIOD = _twapPeriod;
        BASE_TOKEN  = _baseToken;
        QUOTE_TOKEN = _quoteToken;
        BASE_AMOUNT = _baseAmount;
    }

    /// @notice Returns the TWAP price as QUOTE_TOKEN amount per BASE_AMOUNT of BASE_TOKEN.
    function getPrice() external view returns (uint256) {
        (int24 tick,) = OracleLibrary.consult(address(POOL), TWAP_PERIOD);
        return OracleLibrary.getQuoteAtTick(tick, BASE_AMOUNT, BASE_TOKEN, QUOTE_TOKEN);
    }

    /// @notice Returns false if the POOL lacks sufficient observation history for TWAP_PERIOD.
    function hasEnoughHistory() external view returns (bool) {
        uint32 oldestObservation = OracleLibrary.getOldestObservationSecondsAgo(address(POOL));
        return oldestObservation >= TWAP_PERIOD;
    }
}
