import { getFeeCalculator } from "@/lib/exchange/fees";
import { TradingMode } from "@/lib/exchange";
import { calculateExecutedEntryAccounting } from "@/lib/trading/execute/execute-entry";
import { calculateFuturesExitNetProceeds } from "@/lib/trading/execute/execute-exit";
import { computeClosedPositionMetrics } from "@/lib/trading/pnl";
import { createTestPosition } from "../fixtures/position";

describe("trade bookkeeping", () => {
  it("records futures TP PnL from entry price instead of usdt divided by rounded quantity", () => {
    const metrics = computeClosedPositionMetrics(
      createTestPosition({
        direction: "LONG",
        entryPrice: 0.1922,
        quantity: 51,
        notionalUsdt: 10,
        marginUsdt: 5.005,
        leverage: 2,
      }),
      0.1974,
      getFeeCalculator("binance").getBothSideFeePercent({ type: "taker" }) / 100,
    );

    expect(metrics).not.toBeNull();
    expect(metrics?.netProfitPercent).toBe(2.506);
    expect(metrics?.netProfitUSDT).toBe(0.251);
    expect(metrics?.netCurrentUSDT).toBe(10.251);
  });

  it("debits futures sandbox entry from rounded executed notional", () => {
    const accounting = calculateExecutedEntryAccounting({
      feeRate: 0.0005,
      leverage: 2,
      price: 58.49,
      quantity: 0.6,
      tradingMode: TradingMode.FUTURES,
    });

    expect(accounting.notionalUSDT).toBeCloseTo(35.094, 6);
    expect(accounting.marginUSDT).toBeCloseTo(17.547, 6);
    expect(accounting.feeUSDT).toBeCloseTo(0.017547, 6);
    expect(accounting.quoteSpentUSDT).toBeCloseTo(17.564547, 6);
  });

  it("returns futures margin plus gross PnL minus exit fee on sandbox exit", () => {
    const entryAccounting = calculateExecutedEntryAccounting({
      feeRate: 0.001,
      leverage: 3,
      price: 0.1873,
      quantity: 1596,
      tradingMode: TradingMode.FUTURES,
    });
    const balanceAfterEntry = 1000 - entryAccounting.quoteSpentUSDT;
    const exitFee = 1596 * 0.188 * 0.001;
    const exitProceeds = calculateFuturesExitNetProceeds({
      direction: "LONG",
      entryPrice: 0.1873,
      exitPrice: 0.188,
      feeUSDT: exitFee,
      leverage: 3,
      quantity: 1596,
    });

    expect(balanceAfterEntry + exitProceeds).toBeCloseTo(1000.5182212, 6);
  });
});
