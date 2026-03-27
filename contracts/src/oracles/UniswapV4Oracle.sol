// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OracleLibrary} from "../vendor/OracleLibrary.sol";
import {IUniswapV4StateView} from "../vendor/IUniswapV4StateView.sol";
import {IOracle} from "../interfaces/IOracle.sol";

/// @title UniswapV4Oracle
/// @notice Spot-price oracle backed by a Uniswap V4 pool.
///         Reads the current tick from the V4 StateView contract and converts it
///         to a quote using the same OracleLibrary already used by the V3 oracle.
///         Unlike V3, V4 has no built-in observation ring, so this returns a
///         spot price (no TWAP).  hasEnoughHistory() simply checks the pool is
///         initialized (sqrtPriceX96 > 0).
contract UniswapV4Oracle is IOracle {
    IUniswapV4StateView public immutable STATE_VIEW;
    bytes32             public immutable POOL_ID;
    address             public immutable BASE_TOKEN;
    address             public immutable QUOTE_TOKEN;
    uint128             public immutable BASE_AMOUNT;

    /// @param _stateView  Uniswap V4 StateView contract address.
    /// @param _poolId     32-byte pool identifier (keccak256 of the PoolKey).
    /// @param _baseToken  Token being priced (e.g. WETH).
    /// @param _quoteToken Denomination token (e.g. USDC).
    /// @param _baseAmount 1 unit of base token in its native decimals (e.g. 1e18 for WETH).
    constructor(
        address _stateView,
        bytes32 _poolId,
        address _baseToken,
        address _quoteToken,
        uint128 _baseAmount
    ) {
        require(_stateView  != address(0), "UniswapV4Oracle: zero stateView");
        require(_poolId     != bytes32(0), "UniswapV4Oracle: zero poolId");
        require(_quoteToken != address(0), "UniswapV4Oracle: zero quoteToken");
        // _baseToken may be address(0) for native assets (e.g. MON on Monad)
        require(_baseAmount > 0,           "UniswapV4Oracle: zero baseAmount");

        STATE_VIEW  = IUniswapV4StateView(_stateView);
        POOL_ID     = _poolId;
        BASE_TOKEN  = _baseToken;
        QUOTE_TOKEN = _quoteToken;
        BASE_AMOUNT = _baseAmount;
    }

    /// @notice Returns the spot price as QUOTE_TOKEN amount per BASE_AMOUNT of BASE_TOKEN.
    function getPrice() external view returns (uint256) {
        (, int24 tick,,) = STATE_VIEW.getSlot0(POOL_ID);
        return OracleLibrary.getQuoteAtTick(tick, BASE_AMOUNT, BASE_TOKEN, QUOTE_TOKEN);
    }

    /// @notice Returns true when the pool is initialized (sqrtPriceX96 > 0).
    function hasEnoughHistory() external view returns (bool) {
        (uint160 sqrtPriceX96,,,) = STATE_VIEW.getSlot0(POOL_ID);
        return sqrtPriceX96 > 0;
    }
}
