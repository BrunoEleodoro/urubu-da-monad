// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConfigurationManager
/// @notice Owner-controlled registry serving multiple BinaryMarket contracts from a single deployment.
///         Configuration is scoped per market address.
///         Also maintains the set of registered market addresses authorized to call controller-only
///         vault functions, enabling multiple BinaryMarket contracts to share one LiquidityVault.
contract ConfigurationManager is Ownable {
    // ─────────────────────────────────────────────────────────────────────────
    // Key constants (per-market)
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 public constant MAX_PAYOUT          = "MAX_PAYOUT";
    bytes32 public constant MAX_UTILIZATION_BPS = "MAX_UTILIZATION_BPS";
    bytes32 public constant ORACLE              = "ORACLE";
    bytes32 public constant VAULT               = "VAULT";
    bytes32 public constant FEE_BPS             = "FEE_BPS";
    bytes32 public constant DURATION            = "DURATION";

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Per-market key/value config, keyed by market address.
    mapping(address market => mapping(bytes32 key => bytes32 value)) private _config;

    /// @notice Registered market addresses (BinaryMarket contracts) authorized to call
    ///         controller-only vault functions.
    mapping(address => bool) private _markets;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ConfigSet(address indexed market, bytes32 indexed key, bytes32 value);
    event MarketAdded(address indexed market);
    event MarketRemoved(address indexed market);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getConfig(address market, bytes32 key) external view returns (bytes32) {
        return _config[market][key];
    }

    function isMarket(address account) external view returns (bool) {
        return _markets[account];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mutators
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Write a per-market configuration value. Only callable by the owner.
    function set(address market, bytes32 key, bytes32 value) external onlyOwner {
        _config[market][key] = value;
        emit ConfigSet(market, key, value);
    }

    /// @notice Register a market address (BinaryMarket) so it can call vault liquidity functions.
    function addMarket(address market) external onlyOwner {
        _markets[market] = true;
        emit MarketAdded(market);
    }

    /// @notice Deregister a market address, revoking its vault access.
    function removeMarket(address market) external onlyOwner {
        _markets[market] = false;
        emit MarketRemoved(market);
    }
}
