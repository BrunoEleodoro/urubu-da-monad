// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IOracle
/// @notice Common interface for price oracle providers used by Binary.
interface IOracle {
    /// @notice Returns the current price as quoteToken amount per base unit.
    /// @dev Must return zero only on failure — callers revert on zero.
    function getPrice() external view returns (uint256);

    /// @notice Returns true when the oracle has sufficient history to produce a reliable price.
    /// @dev Used as a pre-flight check at deploy time and in monitoring scripts.
    function hasEnoughHistory() external view returns (bool);
}
