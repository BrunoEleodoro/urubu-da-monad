// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LiquidityVault} from "../src/LiquidityVault.sol";

/// @notice Deposits assets into a deployed LiquidityVault on behalf of the caller.
///
/// Run in two separate steps to guarantee approve is confirmed before deposit:
///
///   Step 1 — approve:
///     forge script script/AddLiquidity.s.sol:AddLiquidity --sig "approve()" --rpc-url $RPC_URL --broadcast
///
///   Step 2 — deposit:
///     forge script script/AddLiquidity.s.sol:AddLiquidity --sig "deposit()" --rpc-url $RPC_URL --broadcast
///
/// Required env vars:
///   MNEMONIC          — BIP-39 mnemonic of the depositor
///   MNEMONIC_INDEX    — derivation index (default: 0)
///   VAULT_ADDRESS     — deployed LiquidityVault address
///   DEPOSIT_AMOUNT    — amount of asset tokens to deposit (in asset's native decimals)
contract AddLiquidity is Script {
    function _load()
        internal
        view
        returns (
            uint256 depositorPk,
            address depositor,
            LiquidityVault vault,
            IERC20 asset,
            uint256 amount
        )
    {
        uint256 mnemonicIndex = vm.envOr("MNEMONIC_INDEX", uint256(0));
        // forge-lint: disable-next-line(unsafe-cheatcode,unsafe-typecast)
        depositorPk = vm.deriveKey(vm.envString("MNEMONIC"), uint32(mnemonicIndex));
        depositor = vm.addr(depositorPk);
        vault = LiquidityVault(vm.envAddress("VAULT_ADDRESS"));
        asset = IERC20(vault.asset());
        amount = vm.envUint("DEPOSIT_AMOUNT");
    }

    /// @notice Step 1: approve the vault to pull DEPOSIT_AMOUNT from the depositor.
    function approve() external {
        (uint256 pk, address depositor, LiquidityVault vault, IERC20 asset,) = _load();

        console.log("=== Step 1: Approve ===");
        console.log("Depositor: ", depositor);
        console.log("Vault:     ", address(vault));
        console.log("Amount:    ", type(uint256).max);

//        require(asset.balanceOf(depositor) >= amount, "AddLiquidity: insufficient asset balance");

        vm.startBroadcast(pk);
        asset.approve(address(vault), type(uint256).max);
        vm.stopBroadcast();

        console.log("Approval submitted.");
    }

    /// @notice Step 2: deposit into the vault. Run after approve() is confirmed on-chain.
    function deposit() external {
        (uint256 pk, address depositor, LiquidityVault vault, IERC20 asset, uint256 amount) = _load();

        console.log("=== Step 2: Deposit ===");
        console.log("Depositor:          ", depositor);
        console.log("Vault:              ", address(vault));
        console.log("Amount:             ", amount);
        console.log("Allowance:          ", asset.allowance(depositor, address(vault)));
        console.log("Vault TVL before:   ", vault.totalAssets());
        console.log("Vault shares before:", vault.totalSupply());

        require(
            asset.allowance(depositor, address(vault)) >= amount,
            "AddLiquidity: allowance too low, run approve() first"
        );

        vm.startBroadcast(pk);
        uint256 sharesReceived = vault.deposit(amount, depositor);
        vm.stopBroadcast();

        console.log("\n=== Done ===");
        console.log("Shares received:    ", sharesReceived);
        console.log("Vault TVL after:    ", vault.totalAssets());
        console.log("Vault shares after: ", vault.totalSupply());
    }
}
