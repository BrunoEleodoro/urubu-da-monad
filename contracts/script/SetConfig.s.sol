// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";

import {ConfigurationManager} from "../src/ConfigurationManager.sol";

/// @notice Updates ConfigurationManager parameters for a specific BinaryMarket.
///
/// Usage (dry-run):
///   forge script script/SetConfig.s.sol:SetConfig --rpc-url $RPC_URL --chain-id 41454
///
/// Usage (broadcast):
///   forge script script/SetConfig.s.sol:SetConfig --rpc-url $RPC_URL --chain-id 41454 --broadcast --gas-estimate-multiplier 200
///
/// Required env vars:
///   MNEMONIC               — BIP-39 mnemonic of the ConfigurationManager owner
///   MNEMONIC_INDEX         — derivation index (default: 0)
///   CONFIG_MANAGER_ADDRESS — deployed ConfigurationManager address
///   BINARY_MARKET_ADDRESS  — BinaryMarket address whose config to update (determines market ID)
///
/// Optional env vars (only keys present in env are updated):
///   CFG_MAX_PAYOUT          — max stake per position in asset units (e.g. 1000000 = 1 USDC)
///   CFG_MAX_UTILIZATION_BPS — vault utilization cap in bps (e.g. 10000 = 100%)
///   CFG_FEE_BPS             — protocol fee in bps (e.g. 200 = 2%)
///   CFG_DURATION            — position lifetime in seconds (e.g. 120)
///   CFG_ORACLE              — new oracle address
///   CFG_VAULT               — new LiquidityVault address
contract SetConfig is Script {
    function run() external {
        uint256 mnemonicIndex = vm.envOr("MNEMONIC_INDEX", uint256(0));
        // forge-lint: disable-next-line(unsafe-cheatcode,unsafe-typecast)
        uint256 ownerPk = vm.deriveKey(vm.envString("MNEMONIC"), uint32(mnemonicIndex));
        address owner = vm.addr(ownerPk);

        ConfigurationManager configManager = ConfigurationManager(vm.envAddress("CONFIG_MANAGER_ADDRESS"));
        address market = vm.envAddress("BINARY_MARKET_ADDRESS");

        console.log("=== SetConfig ===");
        console.log("Owner:          ", owner);
        console.log("ConfigManager:  ", address(configManager));
        console.log("Market:         ", market);

        vm.startBroadcast(ownerPk);

        _maybeSetUint(configManager, market, configManager.MAX_PAYOUT(),          "CFG_MAX_PAYOUT",          "MAX_PAYOUT");
        _maybeSetUint(configManager, market, configManager.MAX_UTILIZATION_BPS(), "CFG_MAX_UTILIZATION_BPS", "MAX_UTILIZATION_BPS");
        _maybeSetUint(configManager, market, configManager.FEE_BPS(),             "CFG_FEE_BPS",             "FEE_BPS");
        _maybeSetUint(configManager, market, configManager.DURATION(),            "CFG_DURATION",            "DURATION");
        _maybeSetAddr(configManager, market, configManager.ORACLE(),              "CFG_ORACLE",              "ORACLE");
        _maybeSetAddr(configManager, market, configManager.VAULT(),               "CFG_VAULT",               "VAULT");

        vm.stopBroadcast();

        console.log("\n=== Updated values ===");
        console.log("MAX_PAYOUT:          ", uint256(configManager.getConfig(market, configManager.MAX_PAYOUT())));
        console.log("MAX_UTILIZATION_BPS: ", uint256(configManager.getConfig(market, configManager.MAX_UTILIZATION_BPS())));
        console.log("FEE_BPS:             ", uint256(configManager.getConfig(market, configManager.FEE_BPS())));
        console.log("DURATION:            ", uint256(configManager.getConfig(market, configManager.DURATION())));
    }

    function _maybeSetUint(
        ConfigurationManager cm,
        address market,
        bytes32 key,
        string memory envKey,
        string memory label
    ) internal {
        (bool exists, uint256 val) = _tryGetUint(envKey);
        if (!exists) return;
        cm.set(market, key, bytes32(val));
        console.log("  set %s = %d", label, val);
    }

    function _maybeSetAddr(
        ConfigurationManager cm,
        address market,
        bytes32 key,
        string memory envKey,
        string memory label
    ) internal {
        (bool exists, address val) = _tryGetAddr(envKey);
        if (!exists) return;
        cm.set(market, key, bytes32(uint256(uint160(val))));
        console.log("  set %s =", label);
        console.log("        ", val);
    }

    function _tryGetUint(string memory key) internal view returns (bool exists, uint256 val) {
        try vm.envUint(key) returns (uint256 v) {
            return (true, v);
        } catch {
            return (false, 0);
        }
    }

    function _tryGetAddr(string memory key) internal view returns (bool exists, address val) {
        try vm.envAddress(key) returns (address v) {
            return (true, v);
        } catch {
            return (false, address(0));
        }
    }
}
