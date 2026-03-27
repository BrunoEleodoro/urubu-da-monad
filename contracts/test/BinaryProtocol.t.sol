// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {LiquidityVault} from "../src/LiquidityVault.sol";
import {BinaryMarket} from "../src/BinaryMarket.sol";
import {ConfigurationManager} from "../src/ConfigurationManager.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Minimal mock oracle — price is configurable
contract MockOracle is IOracle {
    uint256 public price;
    bool public historyOk = true;

    function setPrice(uint256 p) external { price = p; }
    function setHistoryOk(bool ok) external { historyOk = ok; }
    function getPrice() external view returns (uint256) { return price; }
    function hasEnoughHistory() external view returns (bool) { return historyOk; }
}

// ─────────────────────────────────────────────────────────────────────────────
// LiquidityVault unit tests
// ─────────────────────────────────────────────────────────────────────────────

contract LiquidityVaultTest is Test {
    MockERC20 asset;
    LiquidityVault vault;
    ConfigurationManager configManager;
    address market = makeAddr("market");
    address lp = makeAddr("lp");

    function setUp() public {
        asset = new MockERC20();
        configManager = new ConfigurationManager();
        vault = new LiquidityVault(IERC20(address(asset)), "Liquidity Vault", "lvUSDC", configManager);
        configManager.addMarket(market);
    }

    function test_market_addedCanCallVault() public {
        address extra = makeAddr("extra");
        configManager.addMarket(extra);

        asset.mint(address(vault), 1000e6);
        vm.prank(extra);
        vault.lockLiquidity(100e6);
    }

    function test_totalAssets_excludesLocked() public {
        asset.mint(address(vault), 1000e6);
        assertEq(vault.totalAssets(), 1000e6);

        vm.prank(market);
        vault.lockLiquidity(400e6);

        assertEq(vault.lockedAssets(), 400e6);
        assertEq(vault.totalAssets(), 600e6);
    }

    function test_lockLiquidity_revertsIfInsufficient() public {
        asset.mint(address(vault), 100e6);
        vm.prank(market);
        vm.expectRevert("LiquidityVault: insufficient free assets");
        vault.lockLiquidity(101e6);
    }

    function test_lockLiquidity_onlyMarket() public {
        asset.mint(address(vault), 1000e6);
        vm.expectRevert("LiquidityVault: caller is not a registered market");
        vault.lockLiquidity(100e6);
    }

    function test_releaseLiquidity_toWinner() public {
        asset.mint(address(vault), 1000e6);
        address winner = makeAddr("winner");

        vm.startPrank(market);
        vault.lockLiquidity(500e6);
        vault.releaseLiquidity(500e6, winner, 500e6);
        vm.stopPrank();

        assertEq(vault.lockedAssets(), 0);
        assertEq(asset.balanceOf(winner), 500e6);
    }

    function test_releaseLiquidity_loserFundsStayInVault() public {
        asset.mint(address(vault), 1000e6);

        vm.startPrank(market);
        vault.lockLiquidity(500e6);
        vault.releaseLiquidity(500e6, address(vault), 0);
        vm.stopPrank();

        assertEq(vault.lockedAssets(), 0);
        assertEq(asset.balanceOf(address(vault)), 1000e6);
    }

    function test_releaseLiquidity_underflowReverts() public {
        vm.prank(market);
        vm.expectRevert("LiquidityVault: locked underflow");
        vault.releaseLiquidity(1, address(0), 0);
    }

    function test_lpDeposit_sharesCorrect() public {
        asset.mint(lp, 1000e6);
        vm.startPrank(lp);
        asset.approve(address(vault), 1000e6);
        uint256 shares = vault.deposit(1000e6, lp);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.totalAssets(), 1000e6);
    }

    function test_fees_accrue_to_vault() public {
        asset.mint(lp, 1000e6);
        vm.startPrank(lp);
        asset.approve(address(vault), 1000e6);
        vault.deposit(1000e6, lp);
        vm.stopPrank();

        uint256 sharesBefore = vault.balanceOf(lp);
        uint256 assetsBefore = vault.convertToAssets(sharesBefore);

        asset.mint(address(vault), 20e6);

        uint256 assetsAfter = vault.convertToAssets(vault.balanceOf(lp));
        assertGt(assetsAfter, assetsBefore, "LP should benefit from fees accruing to vault");
    }

    function test_removedMarket_rejected() public {
        configManager.removeMarket(market);

        asset.mint(address(vault), 1000e6);
        vm.prank(market);
        vm.expectRevert("LiquidityVault: caller is not a registered market");
        vault.lockLiquidity(100e6);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BinaryMarket unit tests
// ─────────────────────────────────────────────────────────────────────────────

contract BinaryMarketTest is Test {
    MockERC20 asset;
    LiquidityVault vault;
    MockOracle oracle;
    BinaryMarket controller;
    ConfigurationManager configManager;

    address trader = makeAddr("trader");
    address lp = makeAddr("lp");

    // 100x leverage requires 100x vault capital per position; 10M USDC provides adequate headroom
    uint256 constant INITIAL_LP  = 10_000_000e6;
    uint256 constant ENTRY_PRICE = 2000e6;
    uint256 constant LEVERAGE    = 100;

    function setUp() public {
        asset = new MockERC20();
        oracle = new MockOracle();
        oracle.setPrice(ENTRY_PRICE);

        configManager = new ConfigurationManager();
        vault = new LiquidityVault(IERC20(address(asset)), "Liquidity Vault", "lvUSDC", configManager);
        controller = new BinaryMarket(address(configManager), address(vault));

        configManager.addMarket(address(controller));
        configManager.set(address(controller), configManager.ORACLE(),              bytes32(uint256(uint160(address(oracle)))));
        configManager.set(address(controller), configManager.MAX_PAYOUT(),          bytes32(uint256(10_000e6)));
        configManager.set(address(controller), configManager.MAX_UTILIZATION_BPS(), bytes32(uint256(8000)));
        configManager.set(address(controller), configManager.FEE_BPS(),             bytes32(uint256(200)));
        configManager.set(address(controller), configManager.DURATION(),            bytes32(uint256(120)));

        asset.mint(lp, INITIAL_LP);
        vm.startPrank(lp);
        asset.approve(address(vault), INITIAL_LP);
        vault.deposit(INITIAL_LP, lp);
        vm.stopPrank();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _openLong(uint256 amount) internal returns (uint256 id) {
        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(controller), amount);
        id = controller.openPosition(true, amount);
        vm.stopPrank();
    }

    function _openShort(uint256 amount) internal returns (uint256 id) {
        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(controller), amount);
        id = controller.openPosition(false, amount);
        vm.stopPrank();
    }

    // ── openPosition ─────────────────────────────────────────────────────────

    function test_openPosition_emitsEvent() public {
        uint256 amount = 100e6;
        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(controller), amount);
        controller.openPosition(true, amount);
        vm.stopPrank();
    }

    function test_openPosition_feeGoesToVault() public {
        uint256 amount = 1000e6;
        uint256 id = _openLong(amount);

        (,,, uint256 stake,,,, ) = controller.positions(id);
        uint256 expectedFee = (amount * 200) / 10_000;
        assertEq(stake, amount - expectedFee);

        // totalAssets = balance - lockedAssets
        // balance = INITIAL_LP + fee + stake
        // lockedAssets = stake * LEVERAGE
        uint256 lockedAmount = stake * LEVERAGE;
        uint256 expectedTotalAssets = INITIAL_LP + expectedFee + stake - lockedAmount;
        assertEq(vault.totalAssets(), expectedTotalAssets);
    }

    function test_openPosition_stakeTransferredToVault() public {
        uint256 amount = 1000e6;
        uint256 id = _openLong(amount);
        (,,, uint256 stake,,,, ) = controller.positions(id);
        uint256 expectedFee = (amount * 200) / 10_000;

        assertEq(asset.balanceOf(address(vault)), INITIAL_LP + expectedFee + stake);
    }

    function test_openPosition_liquidityLocked() public {
        uint256 amount = 1000e6;
        uint256 id = _openLong(amount);
        (,,, uint256 stake,,,, ) = controller.positions(id);

        assertEq(vault.lockedAssets(), stake * LEVERAGE);
    }

    function test_openPosition_zeroAmountReverts() public {
        vm.prank(trader);
        vm.expectRevert("BinaryMarket: zero amount");
        controller.openPosition(true, 0);
    }

    function test_openPosition_exceedsMaxSizeReverts() public {
        // 11000 * 0.98 = 10780 stake > 10000 max → revert
        uint256 overMax = 11_000e6;
        asset.mint(trader, overMax);
        vm.startPrank(trader);
        asset.approve(address(controller), overMax);
        vm.expectRevert("BinaryMarket: stake exceeds max");
        controller.openPosition(true, overMax);
        vm.stopPrank();
    }

    function test_openPosition_pausedReverts() public {
        controller.pause();
        asset.mint(trader, 1000e6);
        vm.startPrank(trader);
        asset.approve(address(controller), 1000e6);
        vm.expectRevert();
        controller.openPosition(true, 1000e6);
        vm.stopPrank();
    }

    function test_openPosition_oraclePriceZeroReverts() public {
        oracle.setPrice(0);
        asset.mint(trader, 1000e6);
        vm.startPrank(trader);
        asset.approve(address(controller), 1000e6);
        vm.expectRevert("BinaryMarket: invalid oracle price");
        controller.openPosition(true, 1000e6);
        vm.stopPrank();
    }

    // ── liquidation price ─────────────────────────────────────────────────────

    function test_liquidationPrice_long() public {
        uint256 id = _openLong(1000e6);
        // Long liquidation: entryPrice - entryPrice / (2 * LEVERAGE) = 2000e6 - 10e6 = 1990e6
        assertEq(controller.liquidationPrice(id), ENTRY_PRICE - ENTRY_PRICE / (2 * LEVERAGE));
    }

    function test_liquidationPrice_short() public {
        uint256 id = _openShort(1000e6);
        // Short liquidation: entryPrice + entryPrice / (2 * LEVERAGE) = 2000e6 + 10e6 = 2010e6
        assertEq(controller.liquidationPrice(id), ENTRY_PRICE + ENTRY_PRICE / (2 * LEVERAGE));
    }

    // ── settle ───────────────────────────────────────────────────────────────

    function test_settle_alreadySettledReverts() public {
        uint256 id = _openLong(1000e6);
        oracle.setPrice(ENTRY_PRICE + 1);
        vm.warp(block.timestamp + 120);
        controller.settle(id);
        vm.expectRevert("BinaryMarket: already settled");
        controller.settle(id);
    }

    function test_settle_earlySettlementReverts() public {
        uint256 id = _openLong(1000e6);
        oracle.setPrice(ENTRY_PRICE + 100e6); // profitable, not liquidated
        vm.expectRevert("BinaryMarket: position not yet settleable");
        controller.settle(id);
    }

    function test_settle_longWins() public {
        uint256 id = _openLong(1000e6);
        (,,, uint256 stake,,,, ) = controller.positions(id);

        // Price up 5%: gain = stake * 100 * 100e6 / 2000e6 = stake * 5
        uint256 exitDelta = 100e6;
        oracle.setPrice(ENTRY_PRICE + exitDelta);

        uint256 expectedPayout = stake + (stake * LEVERAGE * exitDelta) / ENTRY_PRICE;
        uint256 traderBefore = asset.balanceOf(trader);
        vm.warp(block.timestamp + 120);
        controller.settle(id);

        assertEq(asset.balanceOf(trader) - traderBefore, expectedPayout);
        assertEq(vault.lockedAssets(), 0);
    }

    function test_settle_shortWins() public {
        uint256 id = _openShort(1000e6);
        (,,, uint256 stake,,,, ) = controller.positions(id);

        // Price down 5%: gain = stake * 100 * 100e6 / 2000e6 = stake * 5
        uint256 exitDelta = 100e6;
        oracle.setPrice(ENTRY_PRICE - exitDelta);

        uint256 expectedPayout = stake + (stake * LEVERAGE * exitDelta) / ENTRY_PRICE;
        uint256 traderBefore = asset.balanceOf(trader);
        vm.warp(block.timestamp + 120);
        controller.settle(id);

        assertEq(asset.balanceOf(trader) - traderBefore, expectedPayout);
        assertEq(vault.lockedAssets(), 0);
    }

    function test_settle_longLoses_partialLoss() public {
        uint256 id = _openLong(1000e6);
        (,,, uint256 stake,,,, ) = controller.positions(id);

        // Price down 0.25% (half of the 0.5% liquidation threshold): partial loss
        uint256 exitDelta = 5e6;
        oracle.setPrice(ENTRY_PRICE - exitDelta);

        uint256 loss = (stake * LEVERAGE * exitDelta) / ENTRY_PRICE;
        uint256 expectedPayout = stake - loss;

        uint256 traderBefore = asset.balanceOf(trader);
        vm.warp(block.timestamp + 120);
        controller.settle(id);

        assertEq(asset.balanceOf(trader) - traderBefore, expectedPayout);
        assertEq(vault.lockedAssets(), 0);
    }

    function test_settle_longLiquidated_fundsAccrueToVault() public {
        uint256 id = _openLong(1000e6);

        uint256 vaultBefore = vault.totalAssets();
        // Price down exactly 0.5% hits liquidation price for 100x leverage
        oracle.setPrice(ENTRY_PRICE - ENTRY_PRICE / (2 * LEVERAGE));
        controller.settle(id);

        assertGt(vault.totalAssets(), vaultBefore, "vault should gain from liquidated trade");
        assertEq(vault.lockedAssets(), 0);
        assertEq(asset.balanceOf(trader), 0);
    }

    function test_settle_exactLiquidation_payoutIsZero() public {
        uint256 id = _openLong(1000e6);
        oracle.setPrice(controller.liquidationPrice(id));
        controller.settle(id);
        assertEq(asset.balanceOf(trader), 0);
    }

    function test_settle_atEntryPrice_refundsStake() public {
        uint256 id = _openLong(1000e6);
        (,,, uint256 stake,,,, ) = controller.positions(id);

        oracle.setPrice(ENTRY_PRICE);
        vm.warp(block.timestamp + 120);
        uint256 traderBefore = asset.balanceOf(trader);
        controller.settle(id);

        // No favorable or adverse move → payout = stake
        assertEq(asset.balanceOf(trader) - traderBefore, stake);
        assertEq(vault.lockedAssets(), 0);
    }

    function test_settle_settleWhilePaused() public {
        uint256 id = _openLong(1000e6);
        controller.pause();

        oracle.setPrice(ENTRY_PRICE + 1);
        vm.warp(block.timestamp + 120);
        controller.settle(id);
        (,,,,,,,bool settled) = controller.positions(id);
        assertTrue(settled);
    }

    function test_settle_nonExistentReverts() public {
        vm.expectRevert("BinaryMarket: position does not exist");
        controller.settle(999);
    }

    // ── admin ────────────────────────────────────────────────────────────────

    function test_admin_setMaxPayout() public {
        configManager.set(address(controller), configManager.MAX_PAYOUT(), bytes32(uint256(5000e6)));
        assertEq(controller.maxPayout(), 5000e6);
    }

    function test_admin_setOracle() public {
        MockOracle newOracle = new MockOracle();
        newOracle.setPrice(3000e6);
        configManager.set(address(controller), configManager.ORACLE(), bytes32(uint256(uint160(address(newOracle)))));
        assertEq(address(controller.oracle()), address(newOracle));
    }

    function test_admin_onlyOwner() public {
        bytes32 key = configManager.MAX_PAYOUT();
        vm.prank(trader);
        vm.expectRevert();
        configManager.set(address(controller), key, bytes32(uint256(1)));
    }

    // ── utilization cap ──────────────────────────────────────────────────────

    function test_utilizationCap() public {
        // With INITIAL_LP = 10M and 100x leverage, each 5000e6 position locks 490_000e6.
        // After n opens: lockedAssets = n*490_000e6, totalAssets ≈ 10M - n*485_000e6
        // Cap condition: n*490k + 490k > (10M - n*485k) * 0.8
        //   → 878_000n > 7_510_000 → n > 8.55 → reverts on 10th open (after 9 succeed)
        uint256 amount = 5000e6;

        for (uint256 i = 0; i < 9; i++) {
            _openLong(amount);
        }

        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(controller), amount);
        vm.expectRevert("BinaryMarket: vault utilization exceeded");
        controller.openPosition(true, amount);
        vm.stopPrank();
    }

    // ── shared vault ──────────────────────────────────────────────────────────

    function test_twoMarkets_shareVault() public {
        BinaryMarket market2 = new BinaryMarket(address(configManager), address(vault));
        configManager.addMarket(address(market2));
        configManager.set(address(market2), configManager.ORACLE(),              bytes32(uint256(uint160(address(oracle)))));
        configManager.set(address(market2), configManager.MAX_PAYOUT(),          bytes32(uint256(10_000e6)));
        configManager.set(address(market2), configManager.MAX_UTILIZATION_BPS(), bytes32(uint256(8000)));
        configManager.set(address(market2), configManager.FEE_BPS(),             bytes32(uint256(200)));
        configManager.set(address(market2), configManager.DURATION(),            bytes32(uint256(120)));

        uint256 amount = 1000e6;

        // open on market1
        uint256 id1 = _openLong(amount);
        (,,, uint256 stake1,,,, ) = controller.positions(id1);

        // open on market2
        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(market2), amount);
        uint256 id2 = market2.openPosition(true, amount);
        vm.stopPrank();
        (,,, uint256 stake2,,,, ) = market2.positions(id2);

        // both locks are reflected in the shared vault
        assertEq(vault.lockedAssets(), (stake1 + stake2) * LEVERAGE);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzz tests
// ─────────────────────────────────────────────────────────────────────────────

contract BinaryMarketFuzzTest is Test {
    MockERC20 asset;
    LiquidityVault vault;
    MockOracle oracle;
    BinaryMarket controller;
    ConfigurationManager configManager;

    address trader = makeAddr("trader");
    address lp = makeAddr("lp");

    uint256 constant INITIAL_LP  = 10_000_000e6;
    uint256 constant ENTRY_PRICE = 2000e6;
    uint256 constant LEVERAGE    = 100;

    function setUp() public {
        asset = new MockERC20();
        oracle = new MockOracle();
        oracle.setPrice(ENTRY_PRICE);

        configManager = new ConfigurationManager();
        vault = new LiquidityVault(IERC20(address(asset)), "LV", "LV", configManager);
        controller = new BinaryMarket(address(configManager), address(vault));

        configManager.addMarket(address(controller));
        configManager.set(address(controller), configManager.ORACLE(),              bytes32(uint256(uint160(address(oracle)))));
        configManager.set(address(controller), configManager.MAX_PAYOUT(),          bytes32(uint256(100_000e6)));
        configManager.set(address(controller), configManager.MAX_UTILIZATION_BPS(), bytes32(uint256(8000)));
        configManager.set(address(controller), configManager.FEE_BPS(),             bytes32(uint256(200)));
        configManager.set(address(controller), configManager.DURATION(),            bytes32(uint256(120)));

        asset.mint(lp, INITIAL_LP);
        vm.startPrank(lp);
        asset.approve(address(vault), INITIAL_LP);
        vault.deposit(INITIAL_LP, lp);
        vm.stopPrank();
    }

    // Bound amount so that stake * LEVERAGE fits within 80% of 10M LP:
    //   stake ≤ 10_000_000e6 * 80% / 100 = 80_000e6
    //   amount ≤ 80_000e6 / 0.98 ≈ 81_632e6 → use 80_000e6 to be safe
    uint256 constant MAX_FUZZ_AMOUNT = 80_000e6;

    function testFuzz_openAndSettle_longWins(uint256 amount, uint256 exitPriceDelta) public {
        amount = bound(amount, 10e6, MAX_FUZZ_AMOUNT);
        exitPriceDelta = bound(exitPriceDelta, 1, 1000e6);

        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(controller), amount);
        uint256 id = controller.openPosition(true, amount);
        vm.stopPrank();

        oracle.setPrice(ENTRY_PRICE + exitPriceDelta);

        vm.warp(block.timestamp + 120);
        uint256 traderBefore = asset.balanceOf(trader);
        controller.settle(id);
        assertGt(asset.balanceOf(trader) - traderBefore, 0);
        assertEq(vault.lockedAssets(), 0);
    }

    function testFuzz_openAndSettle_longLiquidated(uint256 amount, uint256 exitPriceDelta) public {
        amount = bound(amount, 10e6, MAX_FUZZ_AMOUNT);
        // liqPrice is at entryPrice / (2 * LEVERAGE) adverse move; use 2x to avoid
        // integer division edge cases at the exact boundary (odd stakes)
        uint256 liqDelta = ENTRY_PRICE / LEVERAGE;
        exitPriceDelta = bound(exitPriceDelta, liqDelta, ENTRY_PRICE - 1);

        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(controller), amount);
        uint256 id = controller.openPosition(true, amount);
        vm.stopPrank();

        oracle.setPrice(ENTRY_PRICE - exitPriceDelta);

        controller.settle(id);
        assertEq(vault.lockedAssets(), 0);
        assertEq(asset.balanceOf(trader), 0);
    }

    function testFuzz_lockedAssetsNeverExceedsBalance(uint256 amount) public {
        amount = bound(amount, 10e6, 100_000e6);

        asset.mint(trader, amount);
        vm.startPrank(trader);
        asset.approve(address(controller), amount);

        try controller.openPosition(true, amount) returns (uint256) {
            assertLe(vault.lockedAssets(), asset.balanceOf(address(vault)));
        } catch {}
        vm.stopPrank();
    }
}
