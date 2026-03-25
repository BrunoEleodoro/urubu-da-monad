// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LiquidityVault} from "./LiquidityVault.sol";
import {IOracle} from "./interfaces/IOracle.sol";
import {ConfigurationManager} from "./ConfigurationManager.sol";
import {ConfigParser} from "./libraries/ConfigParser.sol";

/// @title Binary
/// @notice Core logic for the leveraged trading protocol.
///         Positions are 100x leveraged: a 1% adverse price move fully liquidates the position.
///         Protocol fees and liquidated funds flow directly into LiquidityVault,
///         accruing to LP share-holders.
///         Runtime configuration is read from ConfigurationManager.
contract Binary is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ConfigParser for bytes32;

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Position leverage multiplier. At 100x a 1% adverse move liquidates the position.
    uint256 public constant LEVERAGE = 100;

    uint256 private constant BPS_DENOMINATION = 10_000;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Configuration store from which oracle, maxPayout, and maxUtilizationBps are read.
    ConfigurationManager public immutable configManager;

    LiquidityVault public immutable vault;

    uint88 private _nextId;

    struct Position {
        uint88 id;                // self-referencing id; packs with trader in same slot
        address trader;
        bool isLong;
        uint256 stake;            // net of protocol fee
        uint256 entryPrice;       // oracle price at open
        uint256 liquidationPrice; // price at which the entire stake is lost
        uint256 openTime;         // block.timestamp at open
        bool settled;
    }

    mapping(uint256 => Position) public positions;

    uint88[] private _openIds;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event PositionOpened(
        uint256 indexed id,
        address indexed trader,
        bool isLong,
        uint256 stake,
        uint256 lockedAmount,
        uint256 entryPrice,
        uint256 liquidationPrice
    );

    event PositionSettled(
        uint256 indexed id,
        address indexed settler,
        uint256 payout,
        uint256 exitPrice
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(
        address _configManager,
        address _vault
    ) Ownable(msg.sender) {
        require(_configManager != address(0), "Binary: zero configManager");
        require(_vault != address(0), "Binary: zero vault");

        configManager = ConfigurationManager(_configManager);
        vault = LiquidityVault(_vault);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Config views
    // ─────────────────────────────────────────────────────────────────────────

    function oracle() public view returns (IOracle) {
        return IOracle(configManager.getConfig(configManager.ORACLE()).toAddress());
    }

    function maxPayout() public view returns (uint256) {
        return configManager.getConfig(configManager.MAX_PAYOUT()).toUint256();
    }

    function maxUtilizationBps() public view returns (uint256) {
        return configManager.getConfig(configManager.MAX_UTILIZATION_BPS()).toUint256();
    }

    function asset() public view returns (IERC20) {
        return IERC20(vault.asset());
    }

    function feeBps() public view returns (uint256) {
        return configManager.getConfig(configManager.FEE_BPS()).toUint256();
    }

    function duration() public view returns (uint256) {
        return configManager.getConfig(configManager.DURATION()).toUint256();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: open
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Open a long or short leveraged position.
    /// @param isLong  true = long (profit when price rises), false = short (profit when price falls).
    /// @param amount  Gross token amount deposited by trader (protocol fee deducted from this).
    /// @return id     Position identifier.
    function openPosition(bool isLong, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 id)
    {
        _autoSettle();

        require(amount > 0, "Binary: zero amount");

        IERC20 depositAsset = asset();

        // Pull funds from trader
        depositAsset.safeTransferFrom(msg.sender, address(this), amount);

        // Deduct protocol fee — sent directly into LiquidityVault as LP yield
        uint256 feeBps_ = feeBps();
        uint256 stake;
        if (feeBps_ == 0) {
            stake = amount;
        } else {
            uint256 fee = (amount * feeBps_) / BPS_DENOMINATION;
            depositAsset.safeTransfer(address(vault), fee);
            stake = amount - fee;
        }
        require(stake <= maxPayout(), "Binary: stake exceeds max");

        // Lock stake * LEVERAGE from vault LP capital to cover max potential gain
        uint256 lockedAmount = stake * LEVERAGE;
        uint256 freeAssets = vault.totalAssets();
        require(
            vault.lockedAssets() + lockedAmount <= (freeAssets * maxUtilizationBps()) / BPS_DENOMINATION,
            "Binary: vault utilization exceeded"
        );

        // Transfer stake into vault
        depositAsset.safeTransfer(address(vault), stake);

        // Get entry price and compute liquidation price
        uint256 entryPrice = oracle().getPrice();
        require(entryPrice > 0, "Binary: invalid oracle price");

        uint256 liqPrice = isLong
            ? entryPrice - entryPrice / (2 * LEVERAGE)
            : entryPrice + entryPrice / (2 * LEVERAGE);

        // Lock vault liquidity for potential payout
        vault.lockLiquidity(lockedAmount);

        // Store position
        uint88 posId = _nextId++;
        positions[posId] = Position({
            id: posId,
            trader: msg.sender,
            isLong: isLong,
            stake: stake,
            entryPrice: entryPrice,
            liquidationPrice: liqPrice,
            openTime: block.timestamp,
            settled: false
        });
        _openIds.push(posId);

        id = posId;
        emit PositionOpened(id, msg.sender, isLong, stake, lockedAmount, entryPrice, liqPrice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: settle
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Settle a position at the current oracle price.
    ///         Expired positions may be settled by anyone.
    ///         Non-expired positions may only be settled by the trader or owner.
    /// @param id  Position identifier.
    function settle(uint256 id) external nonReentrant {
        Position storage pos = positions[id];
        require(pos.trader != address(0), "Binary: position does not exist");
        require(!pos.settled, "Binary: already settled");
        _settle(pos);
    }

    /// @notice Settle all eligible open positions in a single call.
    function autoSettle() external nonReentrant {
        _autoSettle();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Simulates settlement at the current oracle price and returns what the trader would receive.
    /// @dev Returns 0 for non-existent or already-settled positions.
    function currentPayout(uint256 id) external view returns (uint256) {
        Position storage pos = positions[id];
        if (pos.trader == address(0) || pos.settled) return 0;

        uint256 currentPrice = oracle().getPrice();
        return _calculatePayout(pos, currentPrice);
    }

    /// @notice Returns the stored liquidation price for an open position.
    function liquidationPrice(uint256 id) external view returns (uint256) {
        return positions[id].liquidationPrice;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _autoSettle() private {
        uint256 d = duration();
        uint256 currentPrice = oracle().getPrice();
        if (currentPrice == 0) return;

        uint256 i = 0;
        while (i < _openIds.length) {
            Position storage pos = positions[_openIds[i]];
            if (pos.settled) {
                _openIds[i] = _openIds[_openIds.length - 1];
                _openIds.pop();
            } else {
                bool expired = block.timestamp >= pos.openTime + d;
                bool liquidated = _calculatePayout(pos, currentPrice) == 0;
                if (expired || liquidated) {
                    _settle(pos);
                }
                i++;
            }
        }
    }

    function _settle(Position storage pos) private {
        if (pos.trader == address(0) || pos.settled) return;

        uint256 exitPrice = oracle().getPrice();
        if (exitPrice == 0) return;

        uint256 payout = _calculatePayout(pos, exitPrice);
        bool expired = block.timestamp >= pos.openTime + duration();

        // Auth required only for non-expired, non-liquidated positions.
        if (!expired && payout != 0) {
            require(msg.sender == pos.trader || msg.sender == owner(), "Binary: not authorized");
        }

        pos.settled = true;

        uint256 lockedAmount = pos.stake * LEVERAGE;
        if (payout > 0) {
            vault.releaseLiquidity(lockedAmount, pos.trader, payout);
        } else {
            // Liquidated: all funds remain in LiquidityVault as LP yield
            vault.releaseLiquidity(lockedAmount, address(vault), 0);
        }

        emit PositionSettled(pos.id, msg.sender, payout, exitPrice);
    }

    /// @dev Returns the payout a trader receives at `exitPrice`.
    ///      gain = stake * LEVERAGE * favorableMove / entryPrice
    ///      loss = stake * LEVERAGE * adverseMove  / entryPrice
    ///      payout = stake + gain - loss, clamped to 0 on full liquidation.
    function _calculatePayout(Position storage pos, uint256 exitPrice) private view returns (uint256) {
        uint256 favorable = pos.isLong
            ? (exitPrice > pos.entryPrice ? exitPrice - pos.entryPrice : 0)
            : (exitPrice < pos.entryPrice ? pos.entryPrice - exitPrice : 0);

        uint256 adverse = pos.isLong
            ? (exitPrice < pos.entryPrice ? pos.entryPrice - exitPrice : 0)
            : (exitPrice > pos.entryPrice ? exitPrice - pos.entryPrice : 0);

        uint256 gain = (pos.stake * LEVERAGE * favorable) / pos.entryPrice;
        uint256 loss = (pos.stake * LEVERAGE * adverse) / pos.entryPrice;

        return loss * 2 >= pos.stake ? 0 : pos.stake + gain - loss;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Pause blocks openPosition; settle remains callable.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
