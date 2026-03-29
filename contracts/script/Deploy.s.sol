// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PythOracle} from "../src/oracles/PythOracle.sol";
import {LiquidityVault} from "../src/LiquidityVault.sol";
import {BinaryMarket} from "../src/BinaryMarket.sol";
import {ConfigurationManager} from "../src/ConfigurationManager.sol";

/// @notice Deployment script for the Binary Options Protocol.
/// See .env.template for required environment variables.
contract Deploy is Script {
    function run() external {
        uint256 mnemonicIndex = vm.envOr("MNEMONIC_INDEX", uint256(0));
        string memory mnemonic = vm.envString("MNEMONIC");
        // forge-lint: disable-next-line(unsafe-cheatcode,unsafe-typecast)
        uint256 deployerPk = vm.deriveKey(mnemonic, uint32(mnemonicIndex));
        address deployer = vm.addr(deployerPk);

        address asset             = vm.envAddress("ASSET");
        uint256 maxPayout         = vm.envUint("MAX_PAYOUT");
        uint256 maxUtilizationBps = vm.envUint("MAX_UTILIZATION_BPS");
        uint256 seedDeposit       = vm.envUint("SEED_DEPOSIT");

        vm.startBroadcast(deployerPk);

        // 1. Deploy PythOracle
        PythOracle oracle = new PythOracle(
            vm.envAddress("PYTH_CONTRACT"),
            vm.envBytes32("PYTH_PRICE_ID"),
            vm.envUint("PYTH_MAX_AGE"),
            uint8(vm.envUint("PYTH_TARGET_DECIMALS"))
        );
        console.log("PythOracle:", address(oracle));

        // 2. Deploy ConfigurationManager
        ConfigurationManager configManager = new ConfigurationManager();
        console.log("ConfigurationManager:", address(configManager));

        // 3. Deploy LiquidityVault
        LiquidityVault vault = new LiquidityVault(IERC20(asset), "Liquidity Vault", "lvUSDC", configManager);
        console.log("LiquidityVault:", address(vault));

        // 4. Deploy BinaryMarket
        BinaryMarket market = new BinaryMarket(address(configManager));
        console.log("BinaryMarket:", address(market));

        // 5. Register market and configure protocol parameters
        configManager.addMarket(address(market));

        configManager.set(address(market), configManager.VAULT(),               bytes32(uint256(uint160(address(vault)))));
        configManager.set(address(market), configManager.ORACLE(),              bytes32(uint256(uint160(address(oracle)))));
        configManager.set(address(market), configManager.MAX_PAYOUT(),          bytes32(maxPayout));
        configManager.set(address(market), configManager.MAX_UTILIZATION_BPS(), bytes32(maxUtilizationBps));
        configManager.set(address(market), configManager.FEE_BPS(),             bytes32(vm.envUint("FEE_BPS")));
        configManager.set(address(market), configManager.DURATION(),            bytes32(vm.envUint("DURATION")));

        // 6. Seed vault with initial deposit to mitigate inflation attack.
        // Skipped when seedDeposit is 0 or the deployer lacks sufficient balance —
        // LiquidityVault._decimalsOffset()=6 already prevents the inflation attack.
        uint256 deployerBalance = IERC20(asset).balanceOf(deployer);
        if (seedDeposit > 0 && deployerBalance >= seedDeposit) {
            IERC20(asset).approve(address(vault), seedDeposit);
            vault.deposit(seedDeposit, deployer);
        } else if (seedDeposit > 0) {
            console.log("Skipping seed deposit: deployer balance too low (has %d, needs %d)", deployerBalance, seedDeposit);
        }

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("Deployer:             ", deployer);
        console.log("PythOracle:           ", address(oracle));
        console.log("LiquidityVault:       ", address(vault));
        console.log("BinaryMarket:         ", address(market));
        console.log("ConfigurationManager: ", address(configManager));
    }
}
