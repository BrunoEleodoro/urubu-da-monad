// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ConfigurationManager} from "../src/ConfigurationManager.sol";
import {BinaryMarket} from "../src/BinaryMarket.sol";
import {LiquidityVault} from "../src/LiquidityVault.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MCK") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockOracle is IOracle {
    uint256 public price = 1e18;
    function getPrice() external view returns (uint256) { return price; }
    function hasEnoughHistory() external pure returns (bool) { return true; }
}

contract ConfigurationManagerTest is Test {
    event ConfigSet(address indexed market, bytes32 indexed key, bytes32 value);

    MockToken asset;
    LiquidityVault vault;
    BinaryMarket binary;
    ConfigurationManager configManager;
    MockOracle oracle;

    address owner = address(this);
    address other = makeAddr("other");

    function setUp() public {
        asset = new MockToken();
        oracle = new MockOracle();

        configManager = new ConfigurationManager();
        vault = new LiquidityVault(IERC20(address(asset)), "LV", "LV", configManager);
        binary = new BinaryMarket(address(configManager));

        configManager.addMarket(address(binary));
        configManager.set(address(binary), configManager.VAULT(),               bytes32(uint256(uint160(address(vault)))));
        configManager.set(address(binary), configManager.ORACLE(),              bytes32(uint256(uint160(address(oracle)))));
        configManager.set(address(binary), configManager.MAX_PAYOUT(),          bytes32(uint256(10_000e6)));
        configManager.set(address(binary), configManager.MAX_UTILIZATION_BPS(), bytes32(uint256(8000)));
        configManager.set(address(binary), configManager.FEE_BPS(),             bytes32(uint256(200)));
        configManager.set(address(binary), configManager.DURATION(),            bytes32(uint256(120)));
    }

    // ── set ───────────────────────────────────────────────────────────────────

    function test_set_storesValue() public {
        address market = address(binary);
        bytes32 key = configManager.MAX_PAYOUT();
        bytes32 value = bytes32(uint256(5_000e6));

        configManager.set(market, key, value);

        assertEq(configManager.getConfig(market, key), value);
    }

    function test_set_emitsEvent() public {
        address market = address(binary);
        bytes32 key = configManager.MAX_PAYOUT();
        bytes32 value = bytes32(uint256(5_000e6));

        vm.expectEmit(true, true, false, true);
        emit ConfigSet(market, key, value);
        configManager.set(market, key, value);
    }

    function test_set_onlyOwner() public {
        bytes32 key = configManager.MAX_PAYOUT();
        vm.prank(other);
        vm.expectRevert();
        configManager.set(address(binary), key, bytes32(uint256(1e6)));
    }

    function test_set_overwrite_updates_value() public {
        address market = address(binary);
        configManager.set(market, configManager.MAX_PAYOUT(), bytes32(uint256(1_000e6)));
        configManager.set(market, configManager.MAX_PAYOUT(), bytes32(uint256(2_000e6)));

        assertEq(configManager.getConfig(market, configManager.MAX_PAYOUT()), bytes32(uint256(2_000e6)));
    }

    // ── Binary reads config at runtime ────────────────────────────────────────

    function test_binary_readsMaxPayout() public {
        assertEq(binary.maxPayout(), 10_000e6);

        configManager.set(address(binary), configManager.MAX_PAYOUT(), bytes32(uint256(5_000e6)));
        assertEq(binary.maxPayout(), 5_000e6);
    }

    function test_binary_readsMaxUtilizationBps() public {
        assertEq(binary.maxUtilizationBps(), 8000);

        configManager.set(address(binary), configManager.MAX_UTILIZATION_BPS(), bytes32(uint256(5000)));
        assertEq(binary.maxUtilizationBps(), 5000);
    }

    function test_binary_readsOracle() public {
        assertEq(address(binary.oracle()), address(oracle));

        MockOracle newOracle = new MockOracle();
        configManager.set(address(binary), configManager.ORACLE(), bytes32(uint256(uint160(address(newOracle)))));
        assertEq(address(binary.oracle()), address(newOracle));
    }

    // ── LiquidityVault checks market registry ─────────────────────────────────

    function test_vault_addedMarketCanCallVault() public {
        address extra = makeAddr("extra");
        configManager.addMarket(extra);

        asset.mint(address(vault), 1000e6);
        vm.prank(extra);
        vault.lockLiquidity(100e6);
    }

    function test_vault_removedMarketRejected() public {
        configManager.removeMarket(address(binary));

        asset.mint(address(vault), 1000e6);
        vm.prank(address(binary));
        vm.expectRevert("LiquidityVault: caller is not a registered market");
        vault.lockLiquidity(100e6);
    }

    // ── Markets share config namespace ────────────────────────────────────────

    function test_twoMarkets_independentConfig() public {
        BinaryMarket binary2 = new BinaryMarket(address(configManager));
        configManager.addMarket(address(binary2));
        configManager.set(address(binary2), configManager.VAULT(),      bytes32(uint256(uint160(address(vault)))));
        configManager.set(address(binary2), configManager.MAX_PAYOUT(), bytes32(uint256(500e6)));

        assertEq(binary.maxPayout(), 10_000e6);
        assertEq(binary2.maxPayout(), 500e6);
    }

    function test_vault_swappable() public {
        LiquidityVault vault2 = new LiquidityVault(IERC20(address(asset)), "LV2", "LV2", configManager);
        configManager.set(address(binary), configManager.VAULT(), bytes32(uint256(uint160(address(vault2)))));

        assertEq(address(binary.vault()), address(vault2));
    }
}
