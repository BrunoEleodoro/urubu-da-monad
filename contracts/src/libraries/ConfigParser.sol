// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ConfigParser
/// @notice Typed conversion helpers for bytes32 config values.
library ConfigParser {
    function toUint256(bytes32 value) internal pure returns (uint256) {
        return uint256(value);
    }

    function toAddress(bytes32 value) internal pure returns (address) {
        return address(uint160(uint256(value)));
    }
}
