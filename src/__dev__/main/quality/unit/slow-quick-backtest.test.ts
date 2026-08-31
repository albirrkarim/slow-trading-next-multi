import { describe, expect, it } from "vitest";

import slowTrading from "@/lib/slowTrading";
import { runBacktestVolatilityDynamic } from "@/lib/dynamic/backtest-volatility";
import { TradingMode } from "@/lib/exchange";
import { createTestPosition } from "../fixtures/position";

const slowQuickBacktest = slowTrading.quickBacktest;
const {
  combineQuickGrowthSeries,
  combineQuickSimulationSeries,
  calculateQuickPositionMetrics,
  calculateQuickSharpeRatio,
  calculateQuickUnusedCapitalDurationMetrics,
  growthOvertimeToQuickSeries,
  positionsToQuickSimulationSeries,
  positionsToQuickTradeHistory,
} = slowTrading.quickBacktest.report;

describe("slow quick backtest report helpers", () => {
  it("converts growth snapshots into dashboard balance series", () => {
    const result = growthOvertimeToQuickSeries([
      {
        timeMs: 1_000,
        timeMsHuman: "t1",
        currentBalance: 100,
        currentSpendableBalance: 90,
        currentReservedBalance: 10,
        currentAsset: 100,
        currentAssetFloating: 101,
        currentBaseAsset: 0,
        currentSafeHaven: 0,
        currentBaseAssetLabeled: {},
        currentBaseAssetPercentCoin: {},
      },
    ]);

    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(result.names).toContain("Current Balance");
    expect(result.series[0]).toEqual([{ time: 1, level: 100 }]);
    expect(result.series[1]).toEqual([{ time: 1, level: 90 }]);
    expect(result.series[2]).toEqual([{ time: 1, level: 10 }]);
  });

  it("labels simulated entry, averaging, and exit markers as one trade group", () => {
    const result = positionsToQuickSimulationSeries({
      INJ: [
        createTestPosition({
          symbol: "INJ",
          tradingMode: TradingMode.FUTURES,
          entryTime: 1_000,
          entryLevel: -3,
          entryPrice: 10,
          notionalUsdt: 25,
          quantity: 2.5,
          direction: "LONG",
          pnl: { netUsdt: 2, netPct: 8 },
          closed: {
            t: 2_000,
            price: 11,
            feeUsdt: 0,
            vPoint: { id: "T_EXIT", lvl: 2 },
            reason: "TAKE_PROFIT",
          },
          averaging: {
            entryLevel: -3,
            lastHandledLevel: -4,
            reserveBaseMarginUsdt: 25,
            reservedRemainingMarginUsdt: 0,
            steps: [],
            executions: [
              {
                t: 1_500,
                level: -4,
                marginUsdt: 50,
                price: 9,
                allocationPct: 2,
              },
            ],
          },
        }),
      ],
    });

    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(result.names).toEqual([
      "TRADE SIMULATION INJ",
      "TRADE SIMULATION INJ",
    ]);
    expect(result.series[0].map((point) => point.text)).toEqual([
      expect.stringContaining("TRADE SIMULATION ENTRY INJ"),
      expect.stringContaining("TRADE SIMULATION EXIT INJ"),
    ]);
    expect(result.series[0][0].level).toBe(-3);
    expect(result.series[0][1].level).toBe(2);
    expect(result.series[1][0].text).toContain("TRADE SIMULATION AVG INJ");
    expect(result.series[1][0].level).toBe(-4);
  });

  it("combines account markers under one trade simulation chart group", () => {
    const result = combineQuickSimulationSeries([
      {
        name: "Account 1",
        result: {
          simulationSeries: {
            names: ["TRADE SIMULATION INJ"],
            series: [
              [{ time: 1, level: -3, text: "TRADE SIMULATION ENTRY INJ" }],
            ],
          },
        },
      },
      {
        name: "Account 2",
        result: {
          simulationSeries: {
            names: ["TRADE SIMULATION BTC"],
            series: [
              [{ time: 2, level: 2, text: "TRADE SIMULATION EXIT BTC" }],
            ],
          },
        },
      },
    ]);

    // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
    expect(result.names).toEqual([
      "TRADE SIMULATION INJ",
      "TRADE SIMULATION BTC",
    ]);
    expect(result.names.every((name) => name.startsWith("TRADE SIMULATION"))).toBe(
      true,
    );
    expect(result.series[0][0].text).toBe(
      "Account 1: TRADE SIMULATION ENTRY INJ",
    );
    expect(result.series[1][0].text).toBe(
      "Account 2: TRADE SIMULATION EXIT BTC",
    );
  });

  it("combines sparse account growth without duplicate-time spikes", () => {
    const makeResult = (series: Array<{ time: number; level: number }>) => ({
      growthOvertimeSeries: {
        names: ["Current Asset"],
        series: [series],
      },
    });
    const result = combineQuickGrowthSeries([
      {
        result: makeResult([
          { time: 1, level: 100 },
          { time: 2, level: 80 },
          { time: 2, level: 90 },
          { time: 4, level: 110 },
        ]),
      },
      {
        result: makeResult([
          { time: 1, level: 200 },
          { time: 3, level: 210 },
          { time: 4, level: 220 },
        ]),
      },
    ]);

    // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
    expect(result.series[0]).toEqual([
      { time: 1, level: 300 },
      { time: 2, level: 290 },
      { time: 3, level: 300 },
      { time: 4, level: 330 },
    ]);
  });

  it("converts simulated closed positions into read-only quick trade history rows", () => {
    const result = positionsToQuickTradeHistory({
      INJ: [
        createTestPosition({
          symbol: "inj",
          tradingMode: TradingMode.FUTURES,
          entryTime: 1_000,
          entryPrice: 10,
          entryId: "inj-entry",
          entryLevel: -3,
          notionalUsdt: 25,
          quantity: 2.5,
          pnl: { netPct: 10 },
          closed: {
            t: 2_000,
            price: 11,
            feeUsdt: 0,
            vPoint: { id: "inj-exit", lvl: 3 },
            reason: "TAKE_PROFIT",
          },
        }),
      ],
    }, {
      INJ: [
        { id: "inj-entry", l: "B", lvl: -3, p: 10, symbol: "INJ", t: 1_000, pct: 5, vb: 1, vq: 10 },
        { id: "inj-dd", l: "B", lvl: -4, p: 9, symbol: "INJ", t: 1_500, pct: 5, vb: 1, vq: 9 },
        { id: "inj-exit", l: "T", lvl: 3, p: 11, symbol: "INJ", t: 2_000, pct: 5, vb: 1, vq: 11 },
      ],
    } as any);

    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(result).toMatchObject([
      {
        executionMode: "sandbox",
        mode: "sandbox",
        opened: {
          vPoint: { id: "inj-entry", lvl: -3 },
        },
        pnl: {
          history: [
            { t: 1_000, pct: 0 },
            { t: 1_500, pct: -10 },
            { t: 2_000, pct: 10 },
          ],
          maxDownPct: -10,
          maxUpPct: 10,
          netPct: 10,
        },
        symbol: "INJ",
        vPoints: [{ id: "inj-dd", lvl: -4 }],
      },
    ]);
  });

  it("exposes the grouped quick backtest API", () => {
    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(slowQuickBacktest.run).toBeTypeOf("function");
    expect(slowQuickBacktest.report.combineQuickGrowthSeries).toBe(
      combineQuickGrowthSeries,
    );
    expect(slowQuickBacktest.report.combineQuickSimulationSeries).toBe(
      combineQuickSimulationSeries,
    );
    expect(slowQuickBacktest.report.calculateQuickSharpeRatio).toBe(
      calculateQuickSharpeRatio,
    );
    expect(slowQuickBacktest.report.calculateQuickUnusedCapitalDurationMetrics).toBe(
      calculateQuickUnusedCapitalDurationMetrics,
    );
    expect(slowQuickBacktest.report.calculateQuickPositionMetrics).toBe(
      calculateQuickPositionMetrics,
    );
    expect(slowQuickBacktest.report.positionsToQuickSimulationSeries).toBe(
      positionsToQuickSimulationSeries,
    );
    expect(slowQuickBacktest.report.positionsToQuickTradeHistory).toBe(
      positionsToQuickTradeHistory,
    );
  });

  it("calculates non-monthly Sharpe for short quick ranges", () => {
    const base = {
      timeMsHuman: "",
      currentBalance: 0,
      currentSpendableBalance: 0,
      currentReservedBalance: 0,
      currentBaseAsset: 0,
      currentAssetFloating: 0,
      currentSafeHaven: 0,
      currentBaseAssetLabeled: {},
      currentBaseAssetPercentCoin: {},
    };
    const sharpe = calculateQuickSharpeRatio([
      { ...base, timeMs: 1, currentAsset: 100 },
      { ...base, timeMs: 2, currentAsset: 110 },
      { ...base, timeMs: 3, currentAsset: 105 },
      { ...base, timeMs: 4, currentAsset: 125 },
    ]);

    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(sharpe).not.toBe(0);
  });

  it("calculates min, avg, and max unused capital duration", () => {
    const hourMs = 60 * 60 * 1000;
    const base = {
      timeMsHuman: "",
      currentSpendableBalance: 0,
      currentReservedBalance: 0,
      currentBaseAsset: 0,
      currentAssetFloating: 0,
      currentSafeHaven: 0,
      currentBaseAssetLabeled: {},
      currentBaseAssetPercentCoin: {},
    };
    const metrics = calculateQuickUnusedCapitalDurationMetrics([
      { ...base, timeMs: 0, currentBalance: 100, currentAsset: 100, currentBaseAsset: 0 },
      { ...base, timeMs: hourMs, currentBalance: 90, currentAsset: 100, currentBaseAsset: 10 },
      { ...base, timeMs: 2 * hourMs, currentBalance: 100, currentAsset: 100, currentBaseAsset: 0 },
      { ...base, timeMs: 5 * hourMs, currentBalance: 80, currentAsset: 100, currentBaseAsset: 20 },
      { ...base, timeMs: 6 * hourMs, currentBalance: 100, currentAsset: 100, currentBaseAsset: 0 },
      { ...base, timeMs: 8 * hourMs, currentBalance: 100, currentAsset: 100, currentBaseAsset: 0 },
    ]);

    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(metrics.minActiveCapitalDurationMs).toBe(hourMs);
    expect(metrics.totalActiveCapitalDurationMs).toBe(2 * hourMs);
    expect(metrics.avgActiveCapitalDurationMs).toBe(hourMs);
    expect(metrics.maxActiveCapitalDurationMs).toBe(hourMs);
    expect(metrics.minUnusedCapitalDurationMs).toBe(hourMs);
    expect(metrics.totalUnusedCapitalDurationMs).toBe(6 * hourMs);
    expect(metrics.avgUnusedCapitalDurationMs).toBe(2 * hourMs);
    expect(metrics.maxUnusedCapitalDurationMs).toBe(3 * hourMs);
    expect(
      metrics.totalActiveCapitalDurationMs +
        metrics.totalUnusedCapitalDurationMs,
    ).toBe(8 * hourMs);
    expect(metrics.totalActiveCapitalDuration).toBe("2h");
    expect(metrics.minUnusedCapitalDuration).toBe("1h");
    expect(metrics.totalUnusedCapitalDuration).toBe("6h");
    expect(metrics.avgUnusedCapitalDuration).toBe("2h");
    expect(metrics.maxUnusedCapitalDuration).toBe("3h");
  });

  it("calculates max position drawdown and hold duration metrics", () => {
    const hourMs = 60 * 60 * 1000;
    const positionsBySymbol = {
      LONG: [
        createTestPosition({
          symbol: "LONG",
          tradingMode: TradingMode.FUTURES,
          entryTime: 0,
          entryPrice: 100,
          notionalUsdt: 10,
          quantity: 1,
          direction: "LONG",
          closed: {
            t: 2 * hourMs,
            price: 105,
            feeUsdt: 0,
            reason: "TAKE_PROFIT",
          },
        }),
      ],
      SHORT: [
        createTestPosition({
          symbol: "SHORT",
          tradingMode: TradingMode.FUTURES,
          entryTime: 0,
          entryPrice: 100,
          notionalUsdt: 10,
          quantity: 1,
          direction: "SHORT",
          closed: {
            t: 4 * hourMs,
            price: 95,
            feeUsdt: 0,
            reason: "TAKE_PROFIT",
          },
        }),
      ],
    };
    const volatilityMap = {
      LONG: [
        { id: "l1", l: "B", lvl: -1, p: 100, t: 0, pct: 5, vb: 1, vq: 100 },
        { id: "l2", l: "B", lvl: -2, p: 88, t: hourMs, pct: 5, vb: 1, vq: 88 },
        { id: "l3", label: "TOP", level: 0, price: 105, time: 2 * hourMs },
      ],
      SHORT: [
        { id: "s1", l: "T", lvl: 1, p: 100, t: 0, pct: 5, vb: 1, vq: 100 },
        { id: "s2", l: "T", lvl: 2, p: 115, t: hourMs, pct: 5, vb: 1, vq: 115 },
        { id: "s3", label: "BOTTOM", level: 0, price: 95, time: 4 * hourMs },
      ],
    } as any;

    const metrics = calculateQuickPositionMetrics({
      positionsBySymbol,
      volatilityMap,
    });

    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(metrics.maxPositionDrawdownPct).toBe(15);
    expect(metrics.minHoldDurationMs).toBe(2 * hourMs);
    expect(metrics.totalHoldDurationMs).toBe(6 * hourMs);
    expect(metrics.avgHoldDurationMs).toBe(3 * hourMs);
    expect(metrics.maxHoldDurationMs).toBe(4 * hourMs);
    expect(metrics.totalHoldDuration).toBe("6h");
    expect(metrics.avgHoldDuration).toBe("3h");
  });

  it("blocks new quick entries during the final four days", async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const start = Date.UTC(2026, 5, 1);
    const earlyEntryTime = start;
    const earlyExitTime = start + dayMs;
    const lateEntryTime = start + 4 * dayMs;
    const end = start + 6 * dayMs;
    const volatilityMap = {
      BTC: [
        { id: "btc-1", l: "B", lvl: -1, p: 100, symbol: "BTC", t: earlyEntryTime, pct: 5, vb: 1, vq: 100 },
        { id: "btc-2", l: "T", lvl: 1, p: 101, symbol: "BTC", t: earlyExitTime, pct: 5, vb: 1, vq: 101 },
        { id: "btc-3", l: "B", lvl: -1, p: 99, symbol: "BTC", t: lateEntryTime, pct: 5, vb: 1, vq: 99 },
        { id: "btc-4", l: "T", lvl: 1, p: 102, symbol: "BTC", t: end, pct: 5, vb: 1, vq: 102 },
      ],
      EARLY: [
        { id: "early-entry", l: "B", lvl: -3, p: 10, symbol: "EARLY", t: earlyEntryTime, pct: 5, vb: 1, vq: 10 },
        { id: "early-exit", l: "T", lvl: 0, p: 11, symbol: "EARLY", t: earlyExitTime, pct: 5, vb: 1, vq: 11 },
        { id: "early-end", l: "T", lvl: 0, p: 11, symbol: "EARLY", t: end, pct: 5, vb: 1, vq: 11 },
      ],
      LATE: [
        { id: "late-entry", l: "B", lvl: -3, p: 10, symbol: "LATE", t: lateEntryTime, pct: 5, vb: 1, vq: 10 },
        { id: "late-exit", l: "T", lvl: 0, p: 11, symbol: "LATE", t: end, pct: 5, vb: 1, vq: 11 },
      ],
    } as any;
    const baseProps = {
      symbols: ["EARLY", "LATE", "BTC"],
      interval: "5m" as const,
      range: "custom",
      startTime: start,
      endTime: end,
      useVolatilityCache: false,
      volatilityMap,
      warmupVolatilityMap: volatilityMap,
      volume24hBySymbol: {
        EARLY: 1_000_000,
        LATE: 1_000_000,
      },
      config: {
        modelConfig: {
          takeProfitPercent: 5,
          stopLossPercent: 20,
        },
        startingBalanceUSDT: 100,
        tradingMode: TradingMode.SPOT,
        enableWatchLogic: false,
      },
      decisionEngine: ({ currentTimeMs }: any) =>
        currentTimeMs === earlyEntryTime || currentTimeMs === lateEntryTime
          ? [
              {
                amountProbab: 1,
                id: currentTimeMs === earlyEntryTime ? "early-entry" : "late-entry",
                symbol: currentTimeMs === earlyEntryTime ? "EARLY" : "LATE",
                l: "B" as const,
                descisionLabel: "BOTTOM",
                lvl: -3,
                maxLeverage: 1,
                pct: 5,
                p: 10,
                t: currentTimeMs,
                vb: 1,
                vq: 10,
                investAmount: 10,
                message: "test entry",
              },
            ]
          : [],
    };

    const result = await runBacktestVolatilityDynamic({
      ...baseProps,
      entryCutoffBufferMs: 4 * dayMs,
    });

    // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
    expect(result.backtestPack.modelMemoryMap.EARLY.positionsSell ?? []).toHaveLength(1);
    expect(result.backtestPack.modelMemoryMap.LATE.positionsSell ?? []).toHaveLength(0);
    expect(result.backtestPack.modelMemoryMap.LATE.positions ?? []).toHaveLength(0);
  });

  it("passes the configured v19 minimum entry level into backtest decisions", async () => {
    const start = Date.UTC(2026, 5, 1);
    const end = start + 5 * 60 * 1_000;
    const seenLevels: Array<number | undefined> = [];
    const volatilityMap = {
      BTC: [
        { id: "btc-start", l: "B", lvl: -1, p: 100, symbol: "BTC", t: start, pct: 5, vb: 1, vq: 100 },
        { id: "btc-end", l: "T", lvl: 1, p: 101, symbol: "BTC", t: end, pct: 5, vb: 1, vq: 101 },
      ],
      SUI: [
        { id: "sui-start", l: "B", lvl: -3, p: 10, symbol: "SUI", t: start, pct: 5, vb: 1, vq: 10 },
        { id: "sui-end", l: "B", lvl: -3, p: 10, symbol: "SUI", t: end, pct: 5, vb: 1, vq: 10 },
      ],
    } as any;

    await runBacktestVolatilityDynamic({
      symbols: ["SUI", "BTC"],
      interval: "5m",
      range: "custom",
      startTime: start,
      endTime: end,
      useVolatilityCache: false,
      volatilityMap,
      warmupVolatilityMap: volatilityMap,
      entryCutoffBufferMs: 0,
      config: {
        minActionableAbsoluteLevel: 4,
        modelConfig: {
          takeProfitPercent: 5,
          stopLossPercent: 20,
        },
        startingBalanceUSDT: 100,
        tradingMode: TradingMode.SPOT,
      },
      decisionEngine: ({ minActionableAbsoluteLevel }) => {
        seenLevels.push(minActionableAbsoluteLevel);
        return [];
      },
    });

    // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
    expect(seenLevels.length).toBeGreaterThan(0);
    expect(seenLevels.every((level) => level === 4)).toBe(true);
  });
});
