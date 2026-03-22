// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title Minimal Uniswap V4 StateView interface
/// @notice StateView is a read-only peripheral contract that exposes pool state
///         stored inside the singleton PoolManager.
interface IUniswapV4StateView {
    /// @notice Returns the current slot0 values for a V4 pool.
    /// @param poolId  The 32-byte pool identifier (keccak256 of the PoolKey).
    function getSlot0(bytes32 poolId)
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24   tick,
            uint24  protocolFee,
            uint24  lpFee
        );
}
