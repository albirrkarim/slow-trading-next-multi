import type { VolatilityPoint } from "@/lib/dynamic";
import blackSwanPortfolioReplay from "@/lib/devBacktest/black-swan/portfolio";
import type { BlackSwanBacktestResult } from "@/lib/devBacktest/black-swan";
import { TradingMode } from "@/lib/exchange";
import type { UnifiedKline } from "@/lib/exchange/types";
import blackSwan, { type BlackSwanConfig } from "@/lib/trading/black-swan";
import type { Position, TradingModelConfig } from "@/lib/trading/models";
import { describe, expect, it } from "vitest";

const MINUTE_MS = 60_000;
const BASE_T = 1_700_000_000_000;

function candles(closes: number[]): UnifiedKline[] {
  return closes.map((close, index) => {
    const openT = BASE_T + index * MINUTE_MS;
    return [
      openT,
      String(close),
      String(close),
      String(close),
      String(close),
      "1",
      openT + MINUTE_MS - 1,
      "1",
      1,
      "1",
      "1",
      "0",
      "",
    ];
  });
}

function detectorResult(
  config: BlackSwanConfig = {
    ...blackSwan.config.defaults,
    enabled: true,
    exitPolicy: "CLOSE_ADVERSE" as const,
  },
): BlackSwanBacktestResult {
  const point = (index: number, status: "NORMAL" | "CRISIS") => ({
    price: index < 62 ? 100 : index === 62 ? 90 : 80,
    reason:
      status === "CRISIS"
        ? ("BTC_HARD_TRIGGER" as const)
        : ("HEALTHY" as const),
    status,
    t: BASE_T + index * MINUTE_MS + MINUTE_MS - 1,
  });
  return {
    config,
    endTime: BASE_T + 65 * MINUTE_MS + MINUTE_MS - 1,
    points: [
      point(60, "NORMAL"),
      point(61, "NORMAL"),
      point(62, "CRISIS"),
      point(65, "CRISIS"),
    ],
    startTime: BASE_T + 60 * MINUTE_MS + MINUTE_MS - 1,
    summary: {
      candleCount: 4,
      crisisMinutes: 2,
      dataStaleMinutes: 0,
      maxBreadthPct: 0,
      maxDrawdownPct: -20,
      protectiveMinutes: 2,
      watchMinutes: 0,
    },
    symbols: ["BTC", "ETH"],
    transitions: [
      {
        from: "NORMAL",
        reason: "BTC_HARD_TRIGGER",
        t: BASE_T + 62 * MINUTE_MS + MINUTE_MS - 1,
        to: "CRISIS",
      },
    ],
  };
}

function vPoint(
  symbol: string,
  index: number,
  level: number,
): VolatilityPoint {
  return {
    id: `${symbol}_${index}`,
    l: level > 0 ? "T" : "B",
    lvl: level,
    p: 100 - Math.max(0, index - 60) * 10,
    pct: 5,
    t: BASE_T + index * MINUTE_MS,
    vb: 1,
    vq: 100,
  };
}

function position(params: {
  averaging?: boolean;
  closePrice?: number;
  symbol: string;
}): Position {
  const entryT = BASE_T + 60 * MINUTE_MS + MINUTE_MS - 1;
  const closeT = BASE_T + 65 * MINUTE_MS + MINUTE_MS - 1;
  const executions = params.averaging
    ? [
        {
          allocationPct: 2,
          level: -2,
          marginUsdt: 40,
          price: 90,
          t: BASE_T + 61 * MINUTE_MS + MINUTE_MS - 1,
        },
      ]
    : [];
  const quantity = params.averaging ? 1 + 200 / 90 : 1;
  const notionalUsdt = params.averaging ? 300 : 100;
  const marginUsdt = params.averaging ? 60 : 20;
  return {
    account: "test-account",
    closed: {
      feeUsdt: quantity * (params.closePrice ?? 80) * 0.001,
      message: "normal backtest exit",
      price: params.closePrice ?? 80,
      reason: "STOP_LOSS",
      t: closeT,
      vPoint: { id: `${params.symbol}_65`, lvl: -3 },
    },
    direction: "LONG",
    executionMode: "sandbox",
    exposure: {
      averageEntryPrice: notionalUsdt / quantity,
      leverage: 5,
      marginUsdt,
      notionalUsdt,
      quantity,
    },
    fees: { entryUsdt: marginUsdt * 0.001 },
    opened: {
      message: "real vPoint entry",
      price: 100,
      reason: "COMMON",
      t: entryT,
      vPoint: { id: `${params.symbol}_60`, lvl: -1 },
    },
    pnl: {},
    strategy: {
      averaging: {
        entryLevel: -1,
        executions,
        lastHandledLevel: params.averaging ? -2 : -1,
        reserveBaseMarginUsdt: 20,
        reservedRemainingMarginUsdt: 0,
        steps: [],
      },
      entry: { engine: "decision.v20", label: "LONG" },
    },
    symbol: params.symbol,
    tradingMode: TradingMode.FUTURES,
  };
}

function replay(params?: {
  candleCloses?: number[];
  candleLows?: Record<number, number>;
  confirmationTBySymbol?: Record<string, Record<string, number>>;
  config?: BlackSwanConfig;
  enableWatchLogic?: boolean;
  monitoringConfig?: {
    negativePnlThresholdPct?: number;
    positivePnlThresholdPct?: number;
    takeProfitOffsetPct?: number;
  };
  modelConfig?: TradingModelConfig;
  positions?: Position[];
}) {
  const btc = candles(
    params?.candleCloses ?? [
      ...Array.from({ length: 62 }, () => 100),
      90,
      85,
      82,
      80,
    ],
  );
  for (const [index, low] of Object.entries(params?.candleLows ?? {})) {
    const candle = btc[Number(index)];
    if (candle) candle[3] = String(low);
  }
  const positions = params?.positions ?? [position({ symbol: "ETH" })];
  const volatilityMap = Object.fromEntries(
    positions.map((item) => [
      item.symbol,
      Array.from({ length: 70 }, (_, index) =>
        vPoint(item.symbol, index, -(1 + (index % 3))),
      ),
    ]),
  );
  const detector = detectorResult(params?.config);
  const modelConfig = params?.modelConfig ?? {
    postAverageRescueExit: { enabled: false, thresholds: [] },
    stopLossPercent: 20,
    takeProfitPercent: 5,
  };
  return blackSwanPortfolioReplay.simulate({
    candleMap: Object.fromEntries([
      ["BTC", btc],
      ...positions.map((item) => [item.symbol, btc] as const),
    ]),
    config: detector.config,
    confirmationTBySymbol: params?.confirmationTBySymbol ?? {},
    detectorResult: detector,
    incidentT: BASE_T + 65 * MINUTE_MS + MINUTE_MS - 1,
    monitoringConfig: params?.monitoringConfig,
    positions,
    replayEndT: BASE_T + 65 * MINUTE_MS + MINUTE_MS - 1,
    startingBalanceUsdt: 400,
    tradingConfig: {
      description: "test",
      enableWatchLogic: params?.enableWatchLogic ?? false,
      averagingRescueProjectionGuardEnabled: false,
      exchangeType: "binance",
      modelConfig,
      name: "test",
      symbols: positions.map((item) => item.symbol),
      tradingMode: TradingMode.FUTURES,
      watchMaxNextAveragingLevels: 3,
      watchReserveLevels: 1,
      watchReservePctAlloc: 2,
    },
    tradingMode: TradingMode.FUTURES,
    volatilityMap,
    vPointGenerationEndT: BASE_T + 100 * MINUTE_MS,
    vPointGenerationStartT: BASE_T,
  });
}

describe("Black Swan savings portfolio replay", () => {
  // BTEST:BLACK_SWAN_SAVINGS_PREVIEW
  it("compares a real vPoint position with and without the crisis exit", () => {
    const result = replay();

    expect(result.summary).toMatchObject({
      emergencyClosedPositions: 1,
      positionCount: 1,
      protectedLossUsdt: 10.11,
      savedUsdt: 9.89,
      totalMarginUsdt: 20,
      totalNotionalUsdt: 100,
      unprotectedLossUsdt: 20,
    });
    expect(result.positions[0]).toMatchObject({
      monitoringReasonAtExit: "negative PnL threshold",
      monitoringStageAtExit: "speedup",
      protectedExitReason: "BLACK_SWAN_CRISIS",
      protectedPnlPct: -10.11,
      protectedPnlUsdt: -10.11,
      symbol: "ETH",
      unprotectedExitReason: "LIQUIDATED",
      unprotectedPnlPct: -100,
      unprotectedPnlUsdt: -20,
    });
  });

  it("does not claim savings for the freeze-only policy", () => {
    const result = replay({
      config: {
        ...blackSwan.config.defaults,
        enabled: true,
        exitPolicy: "FREEZE_ONLY",
      },
    });

    expect(result.summary.emergencyClosedPositions).toBe(0);
    expect(result.summary.savedUsdt).toBe(0);
    expect(result.summary.protectedLossUsdt).toBe(
      result.summary.unprotectedLossUsdt,
    );
  });

  it("reports Standard when no current Runtime Speedup rule matches at exit", () => {
    const result = replay({
      monitoringConfig: {
        negativePnlThresholdPct: 20,
        positivePnlThresholdPct: 20,
        takeProfitOffsetPct: 0,
      },
    });

    expect(result.positions[0]).toMatchObject({
      monitoringStageAtExit: "standard",
    });
    expect(result.positions[0].monitoringReasonAtExit).toContain(
      "No Speedup rule matched",
    );
  });

  // BTEST:BLACK_SWAN_SAVINGS_EXIT_ORDER
  it("liquidates on the earlier one-minute path before Black Swan activates", () => {
    const result = replay({
      candleCloses: [
        ...Array.from({ length: 61 }, () => 100),
        70,
        90,
        85,
        82,
        80,
      ],
      modelConfig: {
        postAverageRescueExit: { enabled: false, thresholds: [] },
        stopLossPercent: 90,
        takeProfitPercent: 5,
      },
    });

    expect(result.summary).toMatchObject({
      emergencyClosedPositions: 0,
      protectedPnlUsdt: -20,
      savedUsdt: 0,
      unprotectedPnlUsdt: -20,
    });
    expect(result.positions[0]).toMatchObject({
      protectedExitReason: "LIQUIDATED",
      protectedPnlPct: -100,
      protectedPnlUsdt: -20,
      unprotectedExitReason: "LIQUIDATED",
      unprotectedPnlPct: -100,
      unprotectedPnlUsdt: -20,
    });
    expect(result.positions[0].protectedExitT).toBeLessThan(
      detectorResult().transitions[0].t,
    );
  });

  // BTEST:BLACK_SWAN_SAVINGS_EXIT_ORDER
  it("detects an earlier liquidation from a completed candle low", () => {
    const result = replay({
      candleLows: { 61: 70 },
      modelConfig: {
        postAverageRescueExit: { enabled: false, thresholds: [] },
        stopLossPercent: 90,
        takeProfitPercent: 5,
      },
    });

    expect(result.positions[0]).toMatchObject({
      protectedExitReason: "LIQUIDATED",
      protectedPnlPct: -100,
      unprotectedExitReason: "LIQUIDATED",
      unprotectedPnlPct: -100,
    });
    expect(result.summary.emergencyClosedPositions).toBe(0);
  });

  // BTEST:BLACK_SWAN_LIVE_LIKE_AVERAGING
  it("ignores historical fills and averages only at the vPoint confirmation price", () => {
    const result = replay({
      candleCloses: [
        ...Array.from({ length: 61 }, () => 100),
        90,
        90,
        85,
        82,
        80,
      ],
      confirmationTBySymbol: {
        SOL: {
          SOL_60: BASE_T + 60 * MINUTE_MS + MINUTE_MS - 1,
          SOL_61: BASE_T + 61 * MINUTE_MS + MINUTE_MS - 1,
        },
      },
      enableWatchLogic: true,
      positions: [position({ averaging: true, symbol: "SOL" })],
    });

    expect(result.positions[0]).toMatchObject({
      averagingExecutions: [
        {
          level: -2,
          marginUsdt: 40,
          multiplier: 2,
          price: 90,
        },
      ],
      entryLevel: -1,
      totalMarginUsdt: 60,
      totalNotionalUsdt: 300,
    });
    expect(result.positions[0].vPoints[0].id).toBe("SOL_55");
    expect(result.positions[0].vPoints.at(-1)?.id).toBe("SOL_68");
    expect(result.summary).toMatchObject({
      positionCount: 1,
      totalMarginUsdt: 60,
      totalNotionalUsdt: 300,
    });
  });

  it("does not reuse averaging fills recorded by the candidate backtest", () => {
    const result = replay({
      enableWatchLogic: false,
      positions: [position({ averaging: true, symbol: "SOL" })],
    });

    expect(result.positions[0]).toMatchObject({
      averagingExecutions: [],
      totalMarginUsdt: 20,
      totalNotionalUsdt: 100,
    });
  });

  // BTEST:BLACK_SWAN_LIVE_LIKE_AVERAGING
  it("does not average when CRISIS exits before the adverse pivot confirms", () => {
    const result = replay({
      confirmationTBySymbol: {
        SOL: {
          SOL_60: BASE_T + 60 * MINUTE_MS + MINUTE_MS - 1,
          SOL_61: BASE_T + 63 * MINUTE_MS + MINUTE_MS - 1,
        },
      },
      enableWatchLogic: true,
      positions: [position({ averaging: true, symbol: "SOL" })],
    });

    expect(result.positions[0]).toMatchObject({
      averagingExecutions: [],
      protectedExitReason: "BLACK_SWAN_CRISIS",
      totalMarginUsdt: 20,
      totalNotionalUsdt: 100,
    });
  });
});
