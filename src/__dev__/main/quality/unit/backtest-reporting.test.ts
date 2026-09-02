import { TradingMode } from "@/lib/exchange";
import { tryToExit } from "@/lib/dynamic/backtest-volatility/exit";
import { countGrowthOvertime } from "@/lib/dynamic/utils/assets";
import { aggregatePositions } from "@/lib/evaluate/analysis/volatility";
import type { DynamicTradeMemory } from "@/lib/dynamic";
import type { TradingModelMemory } from "@/lib/trading/models";
import { createTestPosition } from "../fixtures/position";

function createDynamicTradeMemory(quoteAsset = 390): DynamicTradeMemory {
  return {
    startingBalanceUSDT: 400,
    quoteAsset,
    reservedQuoteAsset: 0,
    safeHaven: 0,
    safeHavenRequest: 0,
    safeHavenHistory: [],
    volatilitySnapshots: [],
    priceNormMapOverTime: {},
  };
}

describe("backtest canonical position reporting", () => {
  it("values a leveraged open position from locked margin and leveraged PnL", () => {
    const position = createTestPosition({
      entryPrice: 10,
      leverage: 4,
      marginUsdt: 10,
      notionalUsdt: 40,
      quantity: 4,
    });

    const growth = countGrowthOvertime({
      timeMs: 2,
      dynamicTradeMemory: createDynamicTradeMemory(),
      modelMemoryMap: {
        SUI: { positions: [position], positionsSell: [] },
      },
      volatilityMap: {
        SUI: [
          {
            id: "T_CURRENT",
            t: 2,
            l: "T",
            pct: 1,
            p: 11,
            vb: 0,
            vq: 0,
            lvl: 1,
            symbol: "SUI",
          },
        ],
      },
    });

    expect(growth.currentBaseAsset).toBe(10);
    expect(growth.currentAsset).toBe(400);
    expect(growth.currentAssetFloating).toBe(404);
  });

  it("returns futures margin plus PnL instead of returning notional", () => {
    const position = createTestPosition({
      entryPrice: 10,
      entryTime: 1,
      leverage: 4,
      marginUsdt: 10,
      notionalUsdt: 40,
      quantity: 4,
    });
    const modelMemory: TradingModelMemory = {
      positions: [position],
      positionsSell: [],
    };
    const dynamicTradeMemory = createDynamicTradeMemory();
    const volatilityMap = {
      SUI: [
        {
          id: "B_TEST",
          t: 0,
          l: "B" as const,
          pct: 1,
          p: 10,
          vb: 0,
          vq: 0,
          lvl: -2,
          symbol: "SUI",
        },
        {
          id: "B_NOT_AVERAGED",
          t: 1,
          l: "B" as const,
          pct: 1,
          p: 9,
          vb: 0,
          vq: 0,
          lvl: -3,
          symbol: "SUI",
        },
        {
          id: "T_EXIT",
          t: 2,
          l: "T" as const,
          pct: 1,
          p: 11,
          vb: 0,
          vq: 0,
          lvl: 1,
          symbol: "SUI",
        },
      ],
    };

    const recoveredUsdt = tryToExit({
      currentTimeMs: 2,
      volatilityMap,
      modelMemoryMap: { SUI: modelMemory },
      forceSell: true,
      backtestPack: {
        currentTimeMsBacktest: 2,
        tradeHistoryMap: { SUI: [] },
        growthOvertime: [],
        modelMemoryMap: { SUI: modelMemory },
        priceNormMapOverTime: {},
        verbose: false,
      },
      config: {
        marginMode: "ISOLATED",
        tradingMode: TradingMode.FUTURES,
      } as any,
      dynamicTradeMemory,
    });

    expect(position.pnl.netUsdt).toBeCloseTo(3.956);
    expect(position.pnl.netPct).toBeCloseTo(9.89);
    expect(position.closed?.feeUsdt).toBeCloseTo(0.044);
    // BOTH:POSITION_VPOINT_PATH
    expect(position.vPoints).toEqual([
      { id: "B_NOT_AVERAGED", lvl: -3 },
    ]);
    expect(recoveredUsdt).toBeCloseTo(13.956);
    expect(recoveredUsdt).toBeLessThan(position.exposure.notionalUsdt);
  });

  it("tracks fee-aware USDT extrema across backtest price movements", () => {
    const position = createTestPosition({
      entryPrice: 10,
      entryTime: 1,
      marginUsdt: 10,
      notionalUsdt: 10,
      quantity: 1,
    });
    const modelMemory: TradingModelMemory = {
      positions: [position],
      positionsSell: [],
    };
    const dynamicTradeMemory = createDynamicTradeMemory();
    const makePoint = (t: number, p: number) => ({
      id: `B_${t}`,
      t,
      l: "B" as const,
      pct: 1,
      p,
      vb: 0,
      vq: 0,
      lvl: -2,
      symbol: "SUI",
    });
    const runAt = (points: ReturnType<typeof makePoint>[]) =>
      tryToExit({
        currentTimeMs: points.at(-1)?.t ?? 0,
        volatilityMap: { SUI: points },
        modelMemoryMap: { SUI: modelMemory },
        forceSell: false,
        backtestPack: {
          currentTimeMsBacktest: points.at(-1)?.t ?? 0,
          tradeHistoryMap: { SUI: [] },
          growthOvertime: [],
          modelMemoryMap: { SUI: modelMemory },
          priceNormMapOverTime: {},
          verbose: false,
        },
        config: {
          marginMode: "ISOLATED",
          modelConfig: {
            stopLossPercent: 90,
            stopLossUSDT: 0,
            takeProfitPercent: 100,
          },
          tradingMode: TradingMode.FUTURES,
        } as any,
        dynamicTradeMemory,
      });

    runAt([makePoint(2, 11)]);

    // BOTH:POSITION_PNL_USDT_EXTREMA
    expect(position.pnl.maxUpUsdt).toBe(0.989);
    expect(position.pnl.maxDownUsdt).toBe(0.989);

    runAt([makePoint(2, 11), makePoint(3, 9)]);

    expect(position.pnl.maxUpUsdt).toBe(0.989);
    expect(position.pnl.maxDownUsdt).toBe(-1.009);
    expect(position.closed).toBeUndefined();
  });

  it("records the first crossed loss instead of the later vPoint rail loss", () => {
    const position = createTestPosition({
      averaging: {
        entryLevel: 0,
        lastHandledLevel: 2,
        reserveBaseMarginUsdt: 6.12,
        reservedRemainingMarginUsdt: 0,
        steps: [],
        executions: [
          { t: 2, level: 1, marginUsdt: 18.36, price: 96, allocationPct: 3 },
          { t: 3, level: 2, marginUsdt: 55.12, price: 92, allocationPct: 3 },
        ],
      },
      entryLevel: 0,
      entryPrice: 100,
      entryTime: 1,
      leverage: 5,
      marginUsdt: 79.6,
      notionalUsdt: 398,
      quantity: 3.98,
    });
    position.fees.entryUsdt = 0.398;
    const modelMemory: TradingModelMemory = {
      positions: [position],
      positionsSell: [],
    };
    const dynamicTradeMemory = createDynamicTradeMemory(320.002);
    const volatilityMap = {
      SUI: [
        {
          id: "L2_AVERAGED",
          t: 3,
          l: "B" as const,
          pct: 4,
          p: 92,
          vb: 0,
          vq: 0,
          lvl: 2,
          symbol: "SUI",
        },
        {
          id: "L3_RAIL",
          t: 4,
          l: "B" as const,
          pct: 4,
          p: 88.43,
          vb: 0,
          vq: 0,
          lvl: 3,
          symbol: "SUI",
        },
      ],
    };

    tryToExit({
      currentTimeMs: 4,
      volatilityMap,
      modelMemoryMap: { SUI: modelMemory },
      forceSell: false,
      backtestPack: {
        currentTimeMsBacktest: 4,
        tradeHistoryMap: { SUI: [] },
        growthOvertime: [],
        modelMemoryMap: { SUI: modelMemory },
        priceNormMapOverTime: {},
        verbose: false,
      },
      config: {
        marginMode: "ISOLATED",
        modelConfig: {
          postAverageRescueExit: { enabled: false, thresholds: [] },
          postAverageStopLoss: {
            enabled: true,
            thresholds: [
              { minAveragingCount: 2, maxNetPnlPct: -2, maxNetPnlUsdt: 0 },
            ],
          },
          stopLossPercent: 15,
          stopLossUSDT: 14,
          takeProfitPercent: 100,
        },
        tradingMode: TradingMode.FUTURES,
      } as any,
      dynamicTradeMemory,
    });

    // BTEST:VPOINT_RAIL_BACKTHINK_LOSS_BOUNDARY
    expect(position.closed?.reason).toBe("POST_AVERAGE_STOP_LOSS");
    expect(position.pnl.netUsdt).toBeCloseTo(-7.96);
    expect(position.pnl.netPct).toBeCloseTo(-2);
    expect(position.closed?.price).toBeGreaterThan(88.43);
    expect(position.closed?.vPoint?.id).toBe("L3_RAIL");
  });

  it("groups performance from canonical lifecycle and PnL fields", () => {
    const openedAt = Date.UTC(2026, 0, 1);
    const positions = [
      createTestPosition({
        entryTime: openedAt,
        netPct: 2,
        netUsdt: 3,
        closed: {
          t: openedAt + 45 * 60 * 1000,
          price: 11,
          feeUsdt: 0,
          reason: "TAKE_PROFIT",
        },
      }),
      createTestPosition({
        entryTime: openedAt,
        netPct: -1,
        netUsdt: -2,
        closed: {
          t: openedAt + 4 * 60 * 60 * 1000,
          price: 9,
          feeUsdt: 0,
          reason: "STOP_LOSS",
        },
      }),
    ];

    expect(aggregatePositions(positions)).toEqual([
      {
        key: 45,
        unit: "minutes",
        time: "45 minutes",
        totalNetProfitUSDT: 3,
        avgPercent: 2,
        frequency: 1,
      },
      {
        key: 4,
        unit: "hours",
        time: "4 hours",
        totalNetProfitUSDT: -2,
        avgPercent: -1,
        frequency: 1,
      },
    ]);
  });
});
