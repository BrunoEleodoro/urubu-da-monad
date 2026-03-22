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
    IUniswapV4StateView public immutable stateView;
    bytes32             public immutable poolId;
    address             public immutable baseToken;
    address             public immutable quoteToken;
    uint128             public immutable baseAmount;

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

        stateView  = IUniswapV4StateView(_stateView);
        poolId     = _poolId;
        baseToken  = _baseToken;
        quoteToken = _quoteToken;
        baseAmount = _baseAmount;
    }

    /// @notice Returns the spot price as quoteToken amount per baseAmount of baseToken.
    function getPrice() external view returns (uint256) {
        (, int24 tick,,) = stateView.getSlot0(poolId);
        return OracleLibrary.getQuoteAtTick(tick, baseAmount, baseToken, quoteToken);
    }

    /// @notice Returns true when the pool is initialized (sqrtPriceX96 > 0).
    function hasEnoughHistory() external view returns (bool) {
        (uint160 sqrtPriceX96,,,) = stateView.getSlot0(poolId);
        return sqrtPriceX96 > 0;
    }
}
