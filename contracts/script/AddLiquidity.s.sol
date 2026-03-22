// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LiquidityVault} from "../src/LiquidityVault.sol";

/// @notice Deposits assets into a deployed LiquidityVault on behalf of the caller.
///
/// Required env vars:
///   MNEMONIC          — BIP-39 mnemonic of the depositor
///   MNEMONIC_INDEX    — derivation index (default: 0)
///   VAULT_ADDRESS     — deployed LiquidityVault address
///   DEPOSIT_AMOUNT    — amount of asset tokens to deposit (in asset's native decimals)
contract AddLiquidity is Script {
    function run() external {
        uint256 mnemonicIndex = vm.envOr("MNEMONIC_INDEX", uint256(0));
        string memory mnemonic = vm.envString("MNEMONIC");
        uint256 depositorPk = vm.deriveKey(mnemonic, uint32(mnemonicIndex));
        address depositor = vm.addr(depositorPk);

        LiquidityVault vault = LiquidityVault(vm.envAddress("VAULT_ADDRESS"));
        uint256 amount = vm.envUint("DEPOSIT_AMOUNT");

        IERC20 asset = IERC20(vault.asset());
        uint256 balance = asset.balanceOf(depositor);

        console.log("=== Add Liquidity ===");
        console.log("Depositor:      ", depositor);
        console.log("Vault:          ", address(vault));
        console.log("Asset:          ", address(asset));
        console.log("Deposit amount: ", amount);
        console.log("Wallet balance: ", balance);
        console.log("Vault TVL before:", vault.totalAssets());
        console.log("Vault shares before:", vault.totalSupply());

        require(balance >= amount, "AddLiquidity: insufficient asset balance");

        vm.startBroadcast(depositorPk);

        asset.approve(address(vault), amount);
        uint256 sharesReceived = vault.deposit(amount, depositor);

        vm.stopBroadcast();

        console.log("\n=== Done ===");
        console.log("Shares received: ", sharesReceived);
        console.log("Vault TVL after: ", vault.totalAssets());
        console.log("Vault shares after:", vault.totalSupply());
    }
}
