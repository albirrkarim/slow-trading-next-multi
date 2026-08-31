import {
  buildDailyCalendarData,
  buildMonthProjection,
  buildTradePnlBalanceSnapshots,
  calculateMonthlyTradeSharpe,
  getDailyWinRateColor,
  getTradeSharpeColor,
  toDailyPnlCalendarTrade,
} from "@/components/LiveDashboard/Shared/DailyPnlCalendarDialog";
import { createTestPosition } from "../fixtures/position";

describe("daily pnl calendar", () => {
  it("calculates unannualized Sharpe from daily trade returns", () => {
    // BOTH:MONTHLY_TRADE_SHARPE
    expect(calculateMonthlyTradeSharpe([1, 2])).toBeCloseTo(3, 6);
    expect(calculateMonthlyTradeSharpe([1, -1])).toBeCloseTo(0, 6);
    expect(calculateMonthlyTradeSharpe([0, 0])).toBeNull();
    expect(calculateMonthlyTradeSharpe([1])).toBeNull();
  });

  it("uses red, orange, and green Trade Sharpe bands", () => {
    expect(getTradeSharpeColor(null)).toBe("default");
    expect(getTradeSharpeColor(0.99)).toBe("error");
    expect(getTradeSharpeColor(1)).toBe("warning");
    expect(getTradeSharpeColor(1.99)).toBe("warning");
    expect(getTradeSharpeColor(2)).toBe("success");
  });

  it("adapts canonical persisted history without flat legacy keys", () => {
    const trade = toDailyPnlCalendarTrade(
      createTestPosition({
        entryTime: Date.UTC(2026, 5, 9, 1),
        netPct: 1.25,
        netUsdt: 9,
        closed: {
          t: Date.UTC(2026, 5, 9, 8),
          price: 1.1,
          feeUsdt: 0,
          reason: "TAKE_PROFIT",
        },
      }),
    );

    expect(trade).toEqual({
      entryTime: Date.UTC(2026, 5, 9, 1),
      exitTime: Date.UTC(2026, 5, 9, 8),
      netPnlPct: 1.25,
      netProfitUSDT: 9,
    });
  });

  it("keeps trade pnl separate from balance snapshot movement", () => {
    const result = buildDailyCalendarData(
      [
        {
          symbol: "SUI",
          entryTime: Date.UTC(2026, 5, 9, 1),
          exitTime: Date.UTC(2026, 5, 9, 8),
          netPnlPct: 1.5,
          netProfitUSDT: 9,
        },
        {
          entryTime: Date.UTC(2026, 5, 9, 9),
          exitTime: Date.UTC(2026, 5, 9, 10),
          netPnlPct: -0.5,
          netProfitUSDT: -2,
        },
      ] as any,
      [
        {
          day: "2026-06-09",
          timestamp: Date.UTC(2026, 5, 9, 23, 55),
          total: 1004.53,
        },
      ],
      1000,
    );

    expect(result.totalPnlUsdt).toBeCloseTo(7, 6);
    expect(result.totalBalancePnlUsdt).toBeCloseTo(4.53, 6);
    expect(result.totalTrades).toBe(2);
    expect(result.months).toHaveLength(1);
    expect(result.months[0]?.tradeSharpe).not.toBeNull();

    const onlyCell = result.months[0]?.cells.find((cell) => cell?.day === "2026-06-09");
    expect(onlyCell?.startBalance).toBeCloseTo(1000, 6);
    expect(onlyCell?.endBalance).toBeCloseTo(1004.53, 6);
    expect(onlyCell?.tradePnlUsdt).toBeCloseTo(7, 6);
    // BOTH:DAILY_TRADE_METRICS
    expect(onlyCell?.tradePnlPercent).toBeCloseTo(1, 6);
    expect(onlyCell?.wins).toBe(1);
    expect(onlyCell?.winRate).toBeCloseTo(50, 6);
    expect(onlyCell?.balancePnlUsdt).toBeCloseTo(4.53, 6);
    expect(onlyCell?.balancePnlPercentOfStart).toBeCloseTo(0.453, 6);

    const projection = buildMonthProjection(result.months[0]!);
    expect(projection?.observedDays).toBe(9);
    expect(projection?.observedTradePnlUsdt).toBeCloseTo(7, 6);
    expect(projection?.averageTradePnlPerDay).toBeCloseTo(7 / 9, 6);
    expect(projection?.tradePerDay).toBeCloseTo(2 / 9, 6);
    expect(projection?.estimatedMonthTradePnlUsdt).toBeCloseTo(70 / 3, 6);
    expect(
      projection?.estimatedMonthTradePnlPercentOfStart,
    ).toBeCloseTo(7 / 3, 6);
    expect(projection?.estimatedEndBalance).toBeCloseTo(1023.333333, 6);
  });

  it("keeps monthly trade Sharpe independent from balance snapshots", () => {
    const history = [
      {
        entryTime: Date.UTC(2026, 5, 1),
        exitTime: Date.UTC(2026, 5, 1, 1),
        netPnlPct: 1,
        netProfitUSDT: 10,
      },
      {
        entryTime: Date.UTC(2026, 5, 2),
        exitTime: Date.UTC(2026, 5, 2, 1),
        netPnlPct: -0.5,
        netProfitUSDT: -5,
      },
    ];
    const withoutCashFlow = buildDailyCalendarData(history, [], 100);
    const withWithdrawal = buildDailyCalendarData(
      history,
      [
        { day: "2026-06-01", timestamp: Date.UTC(2026, 5, 1), total: 110 },
        { day: "2026-06-02", timestamp: Date.UTC(2026, 5, 2), total: 25 },
      ],
      100,
    );

    // BOTH:MONTHLY_TRADE_SHARPE
    expect(withWithdrawal.months[0]?.tradeSharpe).toBeCloseTo(
      withoutCashFlow.months[0]?.tradeSharpe ?? Number.NaN,
      6,
    );
  });

  it("reconstructs a continuous daily backtest balance from closed trades", () => {
    expect(
      buildTradePnlBalanceSnapshots({
        history: [
          {
            entryTime: Date.UTC(2026, 5, 1, 1),
            exitTime: Date.UTC(2026, 5, 1, 8),
            netProfitUSDT: 5,
          },
          {
            entryTime: Date.UTC(2026, 5, 3, 1),
            exitTime: Date.UTC(2026, 5, 3, 8),
            netProfitUSDT: -2,
          },
        ],
        startingBalanceUSDT: 100,
      }),
    ).toEqual([
      {
        day: "2026-06-01",
        timestamp: Date.UTC(2026, 5, 1),
        total: 105,
      },
      {
        day: "2026-06-02",
        timestamp: Date.UTC(2026, 5, 2),
        total: 105,
      },
      {
        day: "2026-06-03",
        timestamp: Date.UTC(2026, 5, 3),
        total: 103,
      },
    ]);
  });

  it("normalizes winning and losing day intensity within each month", () => {
    const result = buildDailyCalendarData(
      [
        { entryTime: Date.UTC(2026, 5, 1), netProfitUSDT: 30 },
        { entryTime: Date.UTC(2026, 5, 2), netProfitUSDT: 70 },
        { entryTime: Date.UTC(2026, 5, 3), netProfitUSDT: -20 },
        { entryTime: Date.UTC(2026, 5, 4), netProfitUSDT: -60 },
      ],
      [],
    );
    const cells = result.months[0]!.cells.filter(Boolean);

    expect(cells.find((cell) => cell?.day === "2026-06-01")?.monthlyPnlShare).toBeCloseTo(0.3);
    expect(cells.find((cell) => cell?.day === "2026-06-02")?.monthlyPnlShare).toBeCloseTo(0.7);
    expect(cells.find((cell) => cell?.day === "2026-06-03")?.monthlyPnlShare).toBeCloseTo(0.25);
    expect(cells.find((cell) => cell?.day === "2026-06-04")?.monthlyPnlShare).toBeCloseTo(0.75);
  });

  it("uses red, yellow, and green win-rate thresholds", () => {
    expect(getDailyWinRateColor(69.99)).toBe("error.main");
    expect(getDailyWinRateColor(70)).toBe("warning.main");
    expect(getDailyWinRateColor(89.99)).toBe("warning.main");
    expect(getDailyWinRateColor(90)).toBe("success.main");
  });
});
