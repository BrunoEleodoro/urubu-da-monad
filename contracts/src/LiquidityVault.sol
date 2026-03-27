// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ConfigurationManager} from "./ConfigurationManager.sol";
import {ConfigParser} from "./libraries/ConfigParser.sol";

/// @title LiquidityVault
/// @notice ERC4626 vault that acts as the sole counterparty to all binary option trades.
///         LP capital and trader stakes in-flight are held here.
///         Protocol fees and funds from losing trades accrue here, benefiting LP share-holders.
///         Any address registered as a market in ConfigurationManager may call liquidity functions,
///         allowing multiple BinaryMarket contracts to share a single vault.
contract LiquidityVault is ERC4626 {
    using SafeERC20 for IERC20;
    using ConfigParser for bytes32;

    /// @notice Configuration store that holds the set of authorized market addresses.
    ConfigurationManager public immutable CONFIG_MANAGER;

    /// @notice Sum of all outstanding position payouts currently reserved.
    uint256 public lockedAssets;

    event LiquidityLocked(uint256 amount);
    event LiquidityReleased(uint256 locked, address indexed recipient, uint256 payout);

    modifier onlyMarket() {
        _onlyMarket();
        _;
    }

    function _onlyMarket() private view {
        require(
            CONFIG_MANAGER.isMarket(msg.sender),
            "LiquidityVault: caller is not a registered market"
        );
    }

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        ConfigurationManager configManager_
    )
        ERC4626(asset_)
        ERC20(name_, symbol_)
    {
        require(address(configManager_) != address(0), "LiquidityVault: zero configManager");
        CONFIG_MANAGER = configManager_;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC4626 override
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Returns vault balance excluding locked assets so share price is not inflated
    ///         by capital already reserved for winners.
    function totalAssets() public view override returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        return balance > lockedAssets ? balance - lockedAssets : 0;
    }

    /// @dev Share token decimals match the underlying asset.
    function decimals() public view override returns (uint8) {
        return IERC20Metadata(asset()).decimals();
    }

    /// @dev Offset used internally for virtual shares (inflation attack mitigation).
    ///      Kept at 6 so the share price calculation uses 10^6 virtual backing shares,
    ///      making a donation attack economically infeasible. Does not affect the
    ///      displayed decimals since decimals() is overridden above.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Controller-only liquidity management
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Reserve `amount` of vault assets as a potential winner payout.
    /// @dev Reverts if free assets are insufficient.
    function lockLiquidity(uint256 amount) external onlyMarket {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        require(balance >= lockedAssets + amount, "LiquidityVault: insufficient free assets");
        lockedAssets += amount;
        emit LiquidityLocked(amount);
    }

    /// @notice Release previously locked liquidity and optionally transfer to a recipient.
    /// @param locked     Amount that was originally locked (payout reserved at open).
    /// @param recipient  Address to send `payout` to; address(this) keeps funds in vault.
    /// @param payout     Actual token amount sent to recipient.
    function releaseLiquidity(uint256 locked, address recipient, uint256 payout) external onlyMarket {
        require(lockedAssets >= locked, "LiquidityVault: locked underflow");
        lockedAssets -= locked;

        if (recipient != address(this) && recipient != address(0) && payout > 0) {
            IERC20(asset()).safeTransfer(recipient, payout);
        }

        emit LiquidityReleased(locked, recipient, payout);
    }
}
