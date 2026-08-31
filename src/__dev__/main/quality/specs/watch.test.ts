import type { AveragingRecommendation } from "@/lib/brain/algorithms/type-execute";
import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import { tryExecuteBacktestAveraging } from "@/lib/dynamic/backtest-volatility/trading";
import { TradingMode } from "@/lib/exchange";
import type { VolatilityPoint } from "@/lib/dynamic";
import slowTrading from "@/lib/slowTrading";
import { executeAveraging } from "@/lib/trading/execute/execute-averaging";
import adaptiveAveraging from "@/lib/trading/adaptive-averaging";
import type {
  PositionAveragingState,
  TradingModelMemory,
} from "@/lib/trading/models";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPosition } from "../fixtures/position";

const { buildState: buildSlowWatchReserveState } =
  slowTrading.watchReserve.reserve;
const {
  generateRecommendations: generateAveragingRecommendations,
  resolveRescueProjection: resolveAveragingRescueProjection,
} = slowTrading.watchReserve.averaging;
const enabledAdaptiveAveraging = adaptiveAveraging.config.createDefault();

function createWatchPosition({
  watchState,
  direction = "LONG",
  entryLevel = watchState.entryLevel,
  entryPrice = 10,
  entryTime = 1,
  leverage = 2,
  marginUsdt = 5,
  notionalUsdt = 10,
  quantity = 1,
}: {
  watchState: PositionAveragingState;
  direction?: "LONG" | "SHORT";
  entryLevel?: number;
  entryPrice?: number;
  entryTime?: number;
  leverage?: number;
  marginUsdt?: number;
  notionalUsdt?: number;
  quantity?: number;
}) {
  return createTestPosition({
    averaging: watchState,
    direction,
    entryLevel,
    entryPrice,
    entryTime,
    executionMode: "sandbox",
    leverage,
    marginUsdt,
    notionalUsdt,
    quantity,
    symbol: "SUI",
    tradingMode: TradingMode.FUTURES,
  });
}

const exchangeMocks = vi.hoisted(() => ({
  adjustQuantity: vi.fn(),
  createOrder: vi.fn(),
  getKlines: vi.fn(),
  getLastOrder: vi.fn(),
  getTotalFeePercent: vi.fn(),
}));

vi.mock("@/lib/exchange", async () => {
  const actual = await vi.importActual<any>("@/lib/exchange");

  return {
    ...actual,
    getExchange: vi.fn(() => ({
      adjustQuantity: exchangeMocks.adjustQuantity,
      createOrder: exchangeMocks.createOrder,
      getFees: () => ({
        getTotalFeePercent: exchangeMocks.getTotalFeePercent,
      }),
      getKlines: exchangeMocks.getKlines,
      getLastOrder: exchangeMocks.getLastOrder,
    })),
  };
});

vi.mock("@/lib/trading/helper/notification", () => ({
  notif: {
    central: vi.fn(),
  },
}));

describe("slow specs watch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeMocks.adjustQuantity.mockImplementation(async (quantity: number) => quantity);
    exchangeMocks.getKlines.mockResolvedValue([
      [2, "10", "10", "10", "10", "100"],
    ]);
    exchangeMocks.getTotalFeePercent.mockReturnValue(0);
  });

  it("reserves two default 2x rolling levels and recommends averaging on deeper volatility", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 10,
      entryLevel: -3,
    });

    // BOTH:WATCH_MECHANISM
    expect(watchState.steps.map((step) => step.marginUsdt)).toEqual([
      20,
      60,
    ]);
    expect(watchState.reservedRemainingMarginUsdt).toBe(80);

    const point = {
      symbol: "SUI",
      l: "B",
      lvl: -4,
      p: 9,
      t: 2,
    } as VolatilityPoint;
    const result = generateAveragingRecommendations({
      activePositions: [
        createWatchPosition({
          watchState,
          entryLevel: -3,
          marginUsdt: 10,
        }),
      ],
      volatilityPointsMap: {
        SUI: [point],
      },
      config: {} as any,
      currentTimeMs: 2,
    });

    // BOTH:WATCH_MECHANISM
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].symbol).toBe("SUI");
    expect(result.recommendations[0].investAmount).toBe(20);
  });

  it("keeps the owning position symbol when compact vPoints omit it", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 10,
      entryLevel: -1,
      reserveLevels: 1,
    });
    const result = generateAveragingRecommendations({
      activePositions: [
        createWatchPosition({
          watchState,
          entryLevel: -1,
          marginUsdt: 10,
        }),
      ],
      volatilityPointsMap: {
        SUI: [
          {
            id: "B_compact",
            l: "B",
            lvl: -2,
            p: 9,
            pct: 2,
            t: 2,
          } as VolatilityPoint,
        ],
      },
      config: {} as any,
      currentTimeMs: 2,
    });

    // BOTH:WATCH_MECHANISM
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].symbol).toBe("SUI");
  });

  it("does not recommend production averaging on weak levels", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 10,
      entryLevel: 0,
    });

    const result = generateAveragingRecommendations({
      activePositions: [
        createWatchPosition({
          watchState,
          entryLevel: 0,
          marginUsdt: 10,
        }),
      ],
      volatilityPointsMap: {
        SUI: [
          {
            symbol: "SUI",
            l: "B",
            lvl: -1,
            p: 9,
            t: 2,
          } as VolatilityPoint,
        ],
      },
      config: {} as any,
      currentTimeMs: 2,
    });

    // PROD:LOW_LEVEL_NO_ACTION_AVERAGING
    expect(result.recommendations).toHaveLength(0);
  });

  it.each([
    {
      direction: "LONG" as const,
      entryLevel: -3,
      targetPoint: { l: "T", lvl: 0 },
      laterAdversePoint: { l: "B", lvl: -4 },
    },
    {
      direction: "SHORT" as const,
      entryLevel: 3,
      targetPoint: { l: "B", lvl: 0 },
      laterAdversePoint: { l: "T", lvl: 4 },
    },
  ])(
    "does not recommend $direction averaging after the target vPoint",
    ({ direction, entryLevel, targetPoint, laterAdversePoint }) => {
      const watchState = buildSlowWatchReserveState({
        direction,
        baseMarginUsdt: 10,
        entryLevel,
        reserveLevels: 1,
        pctAlloc: 2,
      });
      const result = generateAveragingRecommendations({
        activePositions: [
          createWatchPosition({
            watchState,
            direction,
            entryLevel,
            marginUsdt: 10,
          }),
        ],
        volatilityPointsMap: {
          SUI: [
            {
              ...targetPoint,
              symbol: "SUI",
              p: 10,
              t: 2,
            } as VolatilityPoint,
            {
              ...laterAdversePoint,
              symbol: "SUI",
              p: 9,
              t: 3,
            } as VolatilityPoint,
          ],
        },
        config: {} as any,
        currentTimeMs: 3,
      });

      // BOTH:AVERAGING_STOPS_AFTER_TARGET_VPOINT
      expect(result.recommendations).toHaveLength(0);
      expect(watchState.steps[0].status).toBe("RESERVED");
    },
  );

  it("uses the first adaptive multiplier that reaches the threshold-derived rescue profit", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 10,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });

    const result = resolveAveragingRescueProjection({
      position: {
        direction: "LONG",
        exposure: {
          averageEntryPrice: 90,
          quantity: 0.1,
          leverage: 1,
          marginUsdt: 10,
          notionalUsdt: 9,
        },
      },
      step: watchState.steps[0],
      executablePrice: 81,
      rescueAnchorPrice: 80,
      quoteAsset: 100,
      reservedQuoteAsset: 20,
      adaptiveAveraging: enabledAdaptiveAveraging,
      targetMovePct: VOLATILITY_THRESHOLD,
    });

    // BOTH:ADAPTIVE_AVERAGING
    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(result).toMatchObject({
      canExecute: true,
      marginUsdt: 50,
      multiplier: 5,
      reason: "READY",
    });
    expect(result.projectedProfitPct).toBeGreaterThanOrEqual(
      Math.floor(VOLATILITY_THRESHOLD / 2),
    );
  });

  it("rejects averaging without consuming the normal step when no affordable multiplier reaches the target", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 10,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });

    const result = resolveAveragingRescueProjection({
      position: {
        direction: "LONG",
        exposure: {
          averageEntryPrice: 90,
          quantity: 0.1,
          leverage: 1,
          marginUsdt: 10,
          notionalUsdt: 9,
        },
      },
      step: watchState.steps[0],
      executablePrice: 81,
      rescueAnchorPrice: 80,
      quoteAsset: 25,
      reservedQuoteAsset: 20,
      adaptiveAveraging: enabledAdaptiveAveraging,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(result).toMatchObject({
      canExecute: false,
      marginUsdt: 20,
      multiplier: 2,
      reason: "PROJECTED_PROFIT_BELOW_TARGET",
    });
    expect(watchState.steps[0].status).toBe("RESERVED");
  });

  it("keeps adaptive sizing when bypassing the rescue-profit minimum for an extreme vPoint", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const baseParams = {
      position: {
        direction: "LONG" as const,
        exposure: {
          averageEntryPrice: 10,
          quantity: 1,
          leverage: 2,
          marginUsdt: 5,
          notionalUsdt: 10,
        },
      },
      step: watchState.steps[0],
      executablePrice: 8,
      rescueAnchorPrice: 8,
      quoteAsset: 100,
      reservedQuoteAsset: 10,
      adaptiveAveraging: enabledAdaptiveAveraging,
    };

    const atBoundary = resolveAveragingRescueProjection({
      ...baseParams,
      triggerVolatilityPct: VOLATILITY_THRESHOLD * 1.5,
    });
    const aboveBoundary = resolveAveragingRescueProjection({
      ...baseParams,
      triggerVolatilityPct: VOLATILITY_THRESHOLD * 1.5 + 0.01,
    });
    const worsensEntry = resolveAveragingRescueProjection({
      ...baseParams,
      executablePrice: 11,
      triggerVolatilityPct: VOLATILITY_THRESHOLD * 1.5 + 0.01,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(atBoundary).toMatchObject({
      canExecute: false,
      reason: "PROJECTED_PROFIT_BELOW_TARGET",
    });
    expect(aboveBoundary).toMatchObject({
      canExecute: true,
      marginUsdt: 25,
      multiplier: 5,
      reason: "EXTREME_VPOINT_BYPASS",
    });
    expect(worsensEntry).toMatchObject({
      canExecute: false,
      reason: "DOES_NOT_IMPROVE_ENTRY",
    });
  });

  it("applies the inverse entry-improvement and rescue projection to short positions", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "SHORT",
      baseMarginUsdt: 10,
      entryLevel: 3,
      reserveLevels: 1,
      pctAlloc: 2,
    });

    const result = resolveAveragingRescueProjection({
      position: {
        direction: "SHORT",
        exposure: {
          averageEntryPrice: 100,
          quantity: 0.1,
          leverage: 1,
          marginUsdt: 10,
          notionalUsdt: 10,
        },
      },
      step: watchState.steps[0],
      executablePrice: 110,
      rescueAnchorPrice: 108,
      quoteAsset: 100,
      reservedQuoteAsset: 20,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(result).toMatchObject({
      canExecute: true,
      marginUsdt: 20,
      multiplier: 2,
      reason: "READY",
    });
  });

  it("adds futures sandbox averaging margin without treating margin as notional", async () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemory: TradingModelMemory = {
      positions: [
        createWatchPosition({
          watchState,
          entryPrice: 10.2,
          quantity: 1,
          leverage: 2,
          marginUsdt: 5,
          notionalUsdt: 10,
        }),
      ],
      positionsSell: [],
    };

    const result = await executeAveraging({
      symbol: "SUI",
      modelConfig: { orderType: "taker" } as any,
      modelMemory,
      volatilityPoints: [],
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.FUTURES,
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 100,
      },
      reservedQuoteAsset: 10,
      averagingRecommendation: {
        symbol: "SUI",
        lvl: -4,
        p: 10,
        t: 2,
        investAmount: 10,
      } as AveragingRecommendation,
    });
    const position = modelMemory.positions[0];
    const trigger = position.strategy.averaging.executions?.[0];

    // PROD:WATCH_MECHANISM
    expect(result.tradingDetail?.usdtSpent).toBe(-10);
    expect(position.exposure.quantity).toBe(3);
    expect(position.exposure.notionalUsdt).toBe(30);
    expect(position.exposure.marginUsdt).toBe(15);
    expect(result.message).toContain(
      "AVERAGED: margin $10.00 (watch step -4)",
    );
    expect(result.message).not.toContain("AVERAGED: +");
    expect(trigger?.reservedMarginUsdt).toBe(10);
    expect(trigger?.marginUsdt).toBe(10);
    expect(position.strategy.averaging.steps[0]).toMatchObject({
      marginUsdt: 10,
      reservedMarginUsdt: 10,
      status: "USED",
    });
  });

  it("rejects direct production averaging execution on weak levels", async () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: 0,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemory: TradingModelMemory = {
      positions: [
        createWatchPosition({ watchState }),
      ],
      positionsSell: [],
    };

    const result = await executeAveraging({
      symbol: "SUI",
      modelConfig: { orderType: "taker" } as any,
      modelMemory,
      volatilityPoints: [],
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.FUTURES,
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 100,
      },
      reservedQuoteAsset: 10,
      averagingRecommendation: {
        symbol: "SUI",
        lvl: -1,
        investAmount: 10,
      } as AveragingRecommendation,
    });

    // PROD:LOW_LEVEL_NO_ACTION_AVERAGING
    expect(result.message).toContain("LOW_LEVEL_NO_ACTION_AVERAGING");
    expect(exchangeMocks.getKlines).not.toHaveBeenCalled();
  });

  it("blocks direct production averaging after the target vPoint", async () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemory: TradingModelMemory = {
      positions: [
        createWatchPosition({ watchState }),
      ],
      positionsSell: [],
    };
    const volatilityPoints = [
      { symbol: "SUI", l: "T", lvl: 0, p: 10, t: 2 },
      { symbol: "SUI", l: "B", lvl: -4, p: 8, t: 3 },
    ] as VolatilityPoint[];

    const result = await executeAveraging({
      symbol: "SUI",
      modelConfig: { orderType: "taker" } as any,
      modelMemory,
      volatilityPoints,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.FUTURES,
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 100,
      },
      reservedQuoteAsset: 10,
      averagingRecommendation: {
        ...volatilityPoints[1],
        investAmount: 10,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_STOPS_AFTER_TARGET_VPOINT
    expect(result.message).toContain(
      "AVERAGING_STOPS_AFTER_TARGET_VPOINT",
    );
    expect(watchState.steps[0].status).toBe("RESERVED");
    expect(modelMemory.positions[0].exposure.quantity).toBe(1);
    expect(exchangeMocks.getKlines).not.toHaveBeenCalled();
  });

  it("uses the execution price and vPoint anchor for adaptive production averaging", async () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 10,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemory: TradingModelMemory = {
      positions: [
        createWatchPosition({
          watchState,
          entryPrice: 90,
          quantity: 0.1,
          leverage: 1,
          marginUsdt: 10,
          notionalUsdt: 9,
        }),
      ],
      positionsSell: [],
    };
    exchangeMocks.getKlines.mockResolvedValue([
      [2, "81", "81", "81", "81", "100"],
    ]);

    const result = await executeAveraging({
      symbol: "SUI",
      modelConfig: { orderType: "taker" } as any,
      modelMemory,
      volatilityPoints: [],
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.FUTURES,
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 100,
      },
      reservedQuoteAsset: 20,
      adaptiveAveraging: enabledAdaptiveAveraging,
      averagingRecommendation: {
        symbol: "SUI",
        lvl: -4,
        p: 80,
        t: 2,
        investAmount: 20,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(result.tradingDetail?.usdtSpent).toBe(-50);
    expect(
      modelMemory.positions[0].strategy.averaging.steps[0],
    ).toMatchObject({
      marginUsdt: 50,
      reservedMarginUsdt: 20,
      allocationPct: 5,
      status: "USED",
    });
  });

  it("uses adaptive production sizing when an extreme vPoint bypasses the projection target", async () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemory: TradingModelMemory = {
      positions: [
        createWatchPosition({ watchState }),
      ],
      positionsSell: [],
    };
    exchangeMocks.getKlines.mockResolvedValue([
      [2, "8", "8", "8", "8", "100"],
    ]);

    const result = await executeAveraging({
      symbol: "SUI",
      modelConfig: { orderType: "taker" } as any,
      modelMemory,
      volatilityPoints: [],
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.FUTURES,
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 100,
      },
      reservedQuoteAsset: 10,
      adaptiveAveraging: enabledAdaptiveAveraging,
      averagingRecommendation: {
        symbol: "SUI",
        lvl: -4,
        p: 8,
        pct: VOLATILITY_THRESHOLD * 1.5 + 0.01,
        t: 2,
        investAmount: 10,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(result.tradingDetail?.usdtSpent).toBe(-25);
    expect(watchState.steps[0]).toMatchObject({
      marginUsdt: 25,
      reservedMarginUsdt: 10,
      allocationPct: 5,
      status: "USED",
    });
  });

  it("keeps the production watch step when the execution price does not improve entry", async () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemory: TradingModelMemory = {
      positions: [
        createWatchPosition({ watchState }),
      ],
      positionsSell: [],
    };

    const result = await executeAveraging({
      symbol: "SUI",
      modelConfig: { orderType: "taker" } as any,
      modelMemory,
      volatilityPoints: [],
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.FUTURES,
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 100,
      },
      reservedQuoteAsset: 10,
      averagingRecommendation: {
        symbol: "SUI",
        lvl: -4,
        p: 9,
        t: 2,
        investAmount: 10,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(result.message).toContain("DOES_NOT_IMPROVE_ENTRY");
    expect(watchState.steps[0].status).toBe("RESERVED");
    expect(exchangeMocks.adjustQuantity).not.toHaveBeenCalled();

    const guardDisabledResult = await executeAveraging({
      symbol: "SUI",
      modelConfig: { orderType: "taker" } as any,
      modelMemory,
      volatilityPoints: [],
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.FUTURES,
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 100,
      },
      reservedQuoteAsset: 10,
      averagingRescueProjectionGuardEnabled: false,
      averagingRecommendation: {
        symbol: "SUI",
        lvl: -4,
        p: 9,
        t: 2,
        investAmount: 10,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(guardDisabledResult.tradingDetail?.usdtSpent).toBe(-10);
    expect(watchState.steps[0]).toMatchObject({
      marginUsdt: 10,
      allocationPct: 2,
      status: "USED",
    });
  });

  it("adds futures backtest averaging to cumulative margin", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemoryMap: Record<string, TradingModelMemory> = {
      SUI: {
        positions: [
          createWatchPosition({
            watchState,
            entryPrice: 10.2,
            leverage: 2,
            marginUsdt: 5,
            notionalUsdt: 5,
          }),
        ],
        positionsSell: [],
      },
    };
    const backtestPack = {
      tradeHistoryMap: {
        SUI: [],
      },
    } as any;
    const lowLevelDidAverage = tryExecuteBacktestAveraging({
      currentTimeMs: 2,
      modelMemoryMap,
      dynamicTradeMemory: {
        quoteAsset: 100,
        reservedQuoteAsset: 10,
      } as any,
      backtestPack,
      config: {} as any,
      volatilityPoints: [],
      recommend: {
        symbol: "SUI",
        lvl: -1,
        p: 20,
        t: 2,
      } as AveragingRecommendation,
    });

    // PROD:LOW_LEVEL_NO_ACTION_AVERAGING
    expect(lowLevelDidAverage).toBe(false);

    const didAverage = tryExecuteBacktestAveraging({
      currentTimeMs: 2,
      modelMemoryMap,
      dynamicTradeMemory: {
        quoteAsset: 100,
        reservedQuoteAsset: 10,
      } as any,
      backtestPack,
      config: {} as any,
      volatilityPoints: [],
      recommend: {
        symbol: "SUI",
        lvl: -4,
        p: 10,
        t: 2,
      } as AveragingRecommendation,
    });

    // BTEST:WATCH_MECHANISM
    expect(didAverage).toBe(true);
    expect(modelMemoryMap.SUI.positions[0].exposure.quantity).toBe(3);
    expect(modelMemoryMap.SUI.positions[0].exposure.marginUsdt).toBe(15);
    expect(backtestPack.tradeHistoryMap.SUI.at(-1)?.message).toContain(
      "AVERAGED: margin $10.00 (watch step -4)",
    );
    expect(backtestPack.tradeHistoryMap.SUI.at(-1)?.message).not.toContain(
      "AVERAGED: +",
    );
  });

  it("keeps the backtest watch step when rescue projection rejects averaging", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemoryMap: Record<string, TradingModelMemory> = {
      SUI: {
        positions: [
          createWatchPosition({ watchState }),
        ],
        positionsSell: [],
      },
    };

    const didAverage = tryExecuteBacktestAveraging({
      currentTimeMs: 2,
      modelMemoryMap,
      dynamicTradeMemory: {
        quoteAsset: 100,
        reservedQuoteAsset: 10,
      } as any,
      backtestPack: {
        tradeHistoryMap: {
          SUI: [],
        },
      } as any,
      config: {
        adaptiveAveraging: enabledAdaptiveAveraging,
      } as any,
      volatilityPoints: [],
      recommend: {
        symbol: "SUI",
        lvl: -4,
        p: 8,
        t: 2,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(didAverage).toBe(false);
    expect(watchState.steps[0].status).toBe("RESERVED");
    expect(modelMemoryMap.SUI.positions[0].exposure.quantity).toBe(1);

    const guardDisabledDidAverage = tryExecuteBacktestAveraging({
      currentTimeMs: 2,
      modelMemoryMap,
      dynamicTradeMemory: {
        quoteAsset: 100,
        reservedQuoteAsset: 10,
      } as any,
      backtestPack: {
        tradeHistoryMap: {
          SUI: [],
        },
      } as any,
      config: {
        adaptiveAveraging: enabledAdaptiveAveraging,
        averagingRescueProjectionGuardEnabled: false,
      } as any,
      volatilityPoints: [],
      recommend: {
        symbol: "SUI",
        lvl: -4,
        p: 8,
        t: 2,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(guardDisabledDidAverage).toBe(true);
    expect(watchState.steps[0]).toMatchObject({
      marginUsdt: 10,
      allocationPct: 2,
      status: "USED",
    });
  });

  it("blocks direct backtest averaging after the target vPoint", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemoryMap: Record<string, TradingModelMemory> = {
      SUI: {
        positions: [
          createWatchPosition({ watchState }),
        ],
        positionsSell: [],
      },
    };
    const volatilityPoints = [
      { symbol: "SUI", l: "T", lvl: 0, p: 10, t: 2 },
      { symbol: "SUI", l: "B", lvl: -4, p: 8, t: 3 },
    ] as VolatilityPoint[];

    const didAverage = tryExecuteBacktestAveraging({
      currentTimeMs: 3,
      modelMemoryMap,
      dynamicTradeMemory: {
        quoteAsset: 100,
        reservedQuoteAsset: 10,
      } as any,
      backtestPack: {
        tradeHistoryMap: {
          SUI: [],
        },
      } as any,
      config: {} as any,
      volatilityPoints,
      recommend: {
        ...volatilityPoints[1],
        investAmount: 10,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_STOPS_AFTER_TARGET_VPOINT
    expect(didAverage).toBe(false);
    expect(watchState.steps[0].status).toBe("RESERVED");
    expect(modelMemoryMap.SUI.positions[0].exposure.quantity).toBe(1);
  });

  it("uses adaptive backtest sizing when an extreme vPoint bypasses the projection target", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 5,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemoryMap: Record<string, TradingModelMemory> = {
      SUI: {
        positions: [
          createWatchPosition({ watchState }),
        ],
        positionsSell: [],
      },
    };

    const didAverage = tryExecuteBacktestAveraging({
      currentTimeMs: 2,
      modelMemoryMap,
      dynamicTradeMemory: {
        quoteAsset: 100,
        reservedQuoteAsset: 10,
      } as any,
      backtestPack: {
        tradeHistoryMap: {
          SUI: [],
        },
      } as any,
      config: {
        adaptiveAveraging: enabledAdaptiveAveraging,
      } as any,
      volatilityPoints: [],
      recommend: {
        symbol: "SUI",
        lvl: -4,
        p: 8,
        pct: VOLATILITY_THRESHOLD * 1.5 + 0.01,
        t: 2,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(didAverage).toBe(true);
    expect(watchState.steps[0]).toMatchObject({
      marginUsdt: 25,
      reservedMarginUsdt: 10,
      allocationPct: 5,
      status: "USED",
    });
  });

  it("uses the shared adaptive rescue multiplier in backtest averaging", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 10,
      entryLevel: -3,
      reserveLevels: 1,
      pctAlloc: 2,
    });
    const modelMemoryMap: Record<string, TradingModelMemory> = {
      SUI: {
        positions: [
          createWatchPosition({
            watchState,
            entryPrice: 90,
            quantity: 0.1,
            leverage: 1,
            marginUsdt: 10,
            notionalUsdt: 9,
          }),
        ],
        positionsSell: [],
      },
    };

    const didAverage = tryExecuteBacktestAveraging({
      currentTimeMs: 2,
      modelMemoryMap,
      dynamicTradeMemory: {
        quoteAsset: 100,
        reservedQuoteAsset: 20,
      } as any,
      backtestPack: {
        tradeHistoryMap: {
          SUI: [],
        },
      } as any,
      config: {
        adaptiveAveraging: enabledAdaptiveAveraging,
      } as any,
      volatilityPoints: [],
      recommend: {
        symbol: "SUI",
        lvl: -4,
        p: 75,
        t: 2,
      } as AveragingRecommendation,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(didAverage).toBe(true);
    expect(watchState.steps[0]).toMatchObject({
      marginUsdt: 50,
      reservedMarginUsdt: 20,
      allocationPct: 5,
      status: "USED",
    });
  });
});
