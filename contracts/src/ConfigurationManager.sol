// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConfigurationManager
/// @notice Single owner-controlled key/value store for the Binary Options protocol.
///         Binary and LiquidityVault read their configuration from here at runtime.
contract ConfigurationManager is Ownable {
    // ─────────────────────────────────────────────────────────────────────────
    // Key constants
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 public constant MAX_PAYOUT          = "MAX_PAYOUT";
    bytes32 public constant MAX_UTILIZATION_BPS = "MAX_UTILIZATION_BPS";
    bytes32 public constant ORACLE              = "ORACLE";
    bytes32 public constant VAULT_CONTROLLER    = "VAULT_CONTROLLER";
    bytes32 public constant FEE_BPS             = "FEE_BPS";
    bytes32 public constant DURATION            = "DURATION";

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    mapping(bytes32 => bytes32) private _config;

    function getConfig(bytes32 key) external view returns (bytes32) {
        return _config[key];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ConfigSet(bytes32 indexed key, bytes32 value);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Mutators
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Write a configuration value. Only callable by the owner.
    function set(bytes32 key, bytes32 value) external onlyOwner {
        _config[key] = value;
        emit ConfigSet(key, value);
    }
}
