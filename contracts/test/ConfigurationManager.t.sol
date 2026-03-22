// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ConfigurationManager} from "../src/ConfigurationManager.sol";
import {Binary} from "../src/Binary.sol";
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
    event ConfigSet(bytes32 indexed key, bytes32 value);

    MockToken asset;
    LiquidityVault vault;
    Binary binary;
    ConfigurationManager configManager;
    MockOracle oracle;

    address owner = address(this);
    address other = makeAddr("other");

    function setUp() public {
        asset = new MockToken();
        oracle = new MockOracle();

        configManager = new ConfigurationManager();
        vault = new LiquidityVault(IERC20(address(asset)), "LV", "LV", configManager);
        binary = new Binary(address(configManager), address(vault));

        configManager.set(configManager.VAULT_CONTROLLER(), bytes32(uint256(uint160(address(binary)))));
        configManager.set(configManager.ORACLE(), bytes32(uint256(uint160(address(oracle)))));
        configManager.set(configManager.MAX_PAYOUT(), bytes32(uint256(10_000e6)));
        configManager.set(configManager.MAX_UTILIZATION_BPS(), bytes32(uint256(8000)));
        configManager.set(configManager.FEE_BPS(), bytes32(uint256(200)));
        configManager.set(configManager.DURATION(), bytes32(uint256(120)));
    }

    // ── set ───────────────────────────────────────────────────────────────────

    function test_set_storesValue() public {
        bytes32 key = configManager.MAX_PAYOUT();
        bytes32 value = bytes32(uint256(5_000e6));

        configManager.set(key, value);

        assertEq(configManager.getConfig(key), value);
    }

    function test_set_emitsEvent() public {
        bytes32 key = configManager.MAX_PAYOUT();
        bytes32 value = bytes32(uint256(5_000e6));

        vm.expectEmit(true, false, false, true);
        emit ConfigSet(key, value);
        configManager.set(key, value);
    }

    function test_set_onlyOwner() public {
        bytes32 key = configManager.MAX_PAYOUT();
        vm.prank(other);
        vm.expectRevert();
        configManager.set(key, bytes32(uint256(1e6)));
    }

    function test_set_overwrite_updates_value() public {
        configManager.set(configManager.MAX_PAYOUT(), bytes32(uint256(1_000e6)));
        configManager.set(configManager.MAX_PAYOUT(), bytes32(uint256(2_000e6)));

        assertEq(configManager.getConfig(configManager.MAX_PAYOUT()), bytes32(uint256(2_000e6)));
    }

    // ── Binary reads config at runtime ────────────────────────────────────────

    function test_binary_readsMaxPayout() public {
        assertEq(binary.maxPayout(), 10_000e6);

        configManager.set(configManager.MAX_PAYOUT(), bytes32(uint256(5_000e6)));
        assertEq(binary.maxPayout(), 5_000e6);
    }

    function test_binary_readsMaxUtilizationBps() public {
        assertEq(binary.maxUtilizationBps(), 8000);

        configManager.set(configManager.MAX_UTILIZATION_BPS(), bytes32(uint256(5000)));
        assertEq(binary.maxUtilizationBps(), 5000);
    }

    function test_binary_readsOracle() public {
        assertEq(address(binary.oracle()), address(oracle));

        MockOracle newOracle = new MockOracle();
        configManager.set(configManager.ORACLE(), bytes32(uint256(uint160(address(newOracle)))));
        assertEq(address(binary.oracle()), address(newOracle));
    }

    // ── LiquidityVault reads controller at runtime ────────────────────────────

    function test_vault_readsController() public {
        address newController = makeAddr("newController");
        configManager.set(configManager.VAULT_CONTROLLER(), bytes32(uint256(uint160(newController))));

        asset.mint(address(vault), 1000e6);
        vm.prank(newController);
        vault.lockLiquidity(100e6); // succeeds with updated controller
    }

    function test_vault_oldControllerRejectedAfterUpdate() public {
        address newController = makeAddr("newController");
        configManager.set(configManager.VAULT_CONTROLLER(), bytes32(uint256(uint160(newController))));

        asset.mint(address(vault), 1000e6);
        vm.prank(address(binary));
        vm.expectRevert("LiquidityVault: caller is not controller");
        vault.lockLiquidity(100e6);
    }
}
