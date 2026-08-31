import { buildQuickBacktestTradeCountBySymbol } from "@/components/LiveDashboard/Feature/quick-backtest-trade-count";

describe("Quick Backtest trade count chart", () => {
  it("counts trade history rows by symbol for the pie chart", () => {
    expect(
      buildQuickBacktestTradeCountBySymbol([
        { symbol: "sui" },
        { symbol: "AAVE" },
        { symbol: "SUI" },
        { symbol: "  " },
        { symbol: "BTC" },
        { symbol: "AAVE" },
        { symbol: "SUI" },
      ] as any),
    ).toEqual([
      { count: 3, symbol: "SUI" },
      { count: 2, symbol: "AAVE" },
      { count: 1, symbol: "BTC" },
    ]);
  });
});
