import { getTradingPerformance } from "@/lib/evaluate/analysis/performance";

describe("trading performance report", () => {
  it("counts realized futures short exits as closed losses even when the side is BUY", () => {
    const performance = getTradingPerformance([
      {
        time: Date.UTC(2024, 9, 1),
        side: "SELL",
        profit: 0,
        fee: 0,
        tax: 0,
        message: "[HIT]",
        currentAsset: 400,
        currentBalance: 352,
      },
      {
        time: Date.UTC(2024, 9, 8),
        side: "BUY",
        profit: -144,
        fee: 0,
        tax: 0,
        message: "[EXIT] SUI SHORT [L_ISOLATED]",
        currentAsset: 256,
        currentBalance: 256,
      },
      {
        time: Date.UTC(2024, 9, 14),
        side: "BUY",
        profit: 4,
        fee: 0,
        tax: 0,
        message: "[EXIT] SUI SHORT [TAKE_PROFIT]",
        currentAsset: 260,
        currentBalance: 260,
      },
    ] as any);

    expect(performance.totalTrades).toBe(3);
    expect(performance.closedTrades).toBe(2);
    expect(performance.winTrades).toBe(1);
    expect(performance.lossTrades).toBe(1);
    expect(performance.breakEvenTrades).toBe(0);
    expect(performance.totalProfit).toBe(-140);
  });
});
