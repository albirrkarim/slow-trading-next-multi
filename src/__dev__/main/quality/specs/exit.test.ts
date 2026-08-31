import {
  calculateBacktestFeeAdjustedNetProfitUSDT,
  resolveBacktestExitDecision,
} from "@/lib/dynamic/backtest-volatility/exit-policy";
import { TradingMode } from "@/lib/exchange";
import { dynamicExit } from "@/lib/trading/execute/models/exit";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type {
  TradingModelConfig,
  TradingModelMemory,
} from "@/lib/trading/models";
import postAverageRescue from "@/lib/trading/post-average-rescue";
import postAverageStopLoss from "@/lib/trading/post-average-stop-loss";
import { vi } from "vitest";
import { createTestPosition } from "../fixtures/position";

const exchangeMocks = vi.hoisted(() => ({
  getBothSideFeePercent: vi.fn(() => 0),
}));

vi.mock("@/lib/exchange", async () => {
  const actual = await vi.importActual<any>("@/lib/exchange");
  return {
    ...actual,
    getExchange: vi.fn(() => ({
      getFees: () => ({
        getBothSideFeePercent: exchangeMocks.getBothSideFeePercent,
      }),
    })),
  };
});

function createPosition() {
  return createTestPosition({
    symbol: "SUI",
    entryPrice: 100,
    entryTime: 1,
    notionalUsdt: 100,
    quantity: 1,
    direction: "LONG",
    tradingMode: TradingMode.SPOT,
  });
}

function createAveragedPosition(completedAveragingCount = 1) {
  return createTestPosition({
    symbol: "SUI",
    entryPrice: 100,
    entryTime: 1,
    notionalUsdt: 100,
    quantity: 1,
    tradingMode: TradingMode.SPOT,
    averaging: {
      entryLevel: -2,
      lastHandledLevel: -2 - completedAveragingCount,
      reserveBaseMarginUsdt: 100,
      reservedRemainingMarginUsdt: 0,
      steps: Array.from({ length: completedAveragingCount }, (_, index) => ({
        level: -3 - index,
        marginUsdt: 10,
        allocationPct: 2,
        status: "USED" as const,
      })),
      executions: Array.from(
        { length: completedAveragingCount },
        (_, index) => ({
          t: 2 + index,
          level: -3 - index,
          marginUsdt: 10,
          price: 95,
          allocationPct: 2,
        }),
      ),
    },
  });
}

function buildKline(time: number, price: number) {
  return [
    time,
    String(price),
    String(price),
    String(price),
    String(price),
    "100",
  ] as any;
}

function createMemory(): TradingModelMemory {
  return {
    positions: [createPosition()],
    positionsSell: [],
    volatility: {
      symbol: "SUI",
      lastVolatility: [],
    },
  } as any;
}

function createRescueMemory(completedAveragingCount: number) {
  return {
    positions: [createAveragedPosition(completedAveragingCount)],
    positionsSell: [],
    volatility: {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "BOTTOM[-3]",
          l: "B",
          lvl: -3,
          pct: 5,
          p: 90,
          t: 2,
          vb: 1,
          vq: 90,
        },
      ],
    },
  } as TradingModelMemory;
}

const rescueExitConfig: TradingModelConfig = {
  takeProfitPercent: 5,
  stopLossPercent: 90,
  useStopLossPlus: true,
  stopLossPlusTrigger: 1,
  orderType: "taker",
};

describe("slow specs exit", () => {
  it("selects the greatest reached post-average stop tier", () => {
    const config = {
      enabled: true,
      thresholds: [
        { minAveragingCount: 1, maxNetPnlPct: -2, maxNetPnlUsdt: 0 },
        { minAveragingCount: 3, maxNetPnlPct: -4, maxNetPnlUsdt: -12 },
      ],
    };

    expect(postAverageStopLoss.threshold.get(2, config)).toMatchObject({
      minAveragingCount: 1,
      maxNetPnlPct: -2,
    });
    expect(postAverageStopLoss.threshold.get(4, config)).toMatchObject({
      minAveragingCount: 3,
      maxNetPnlUsdt: -12,
    });
  });

  it("disables each zero post-average loss boundary independently", () => {
    const evaluation = postAverageStopLoss.evaluate({
      config: {
        enabled: true,
        thresholds: [
          { minAveragingCount: 1, maxNetPnlPct: 0, maxNetPnlUsdt: -8 },
        ],
      },
      netPnlPercent: -30,
      netPnlUsdt: -7,
      position: createAveragedPosition(1),
    });

    expect(evaluation.hitPercent).toBe(false);
    expect(evaluation.hitUsdt).toBe(false);
    expect(evaluation.shouldExit).toBe(false);
  });

  it("back-thinks a vPoint rail to the first crossed stop boundary", () => {
    const exit = resolveBacktestExitDecision({
      position: createAveragedPosition(2),
      currentPrice: 50,
      forceSell: false,
      globalLiquidation: false,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 50,
        stopLossUSDT: 14,
        postAverageStopLoss: {
          enabled: true,
          thresholds: [
            { minAveragingCount: 2, maxNetPnlPct: -8, maxNetPnlUsdt: 0 },
          ],
        },
      },
    });

    expect(exit).toMatchObject({
      category: TRADE_MESSAGE.sell.POST_AVERAGE_STOP_LOSS,
      netProfitPercent: -8,
      shouldExit: true,
    });
    expect(exit.message).toContain("BOTH:POST_AVERAGE_STOP_LOSS");
    expect(exit.message).toContain("backthinkNetPnlUsdt:-8.00");
    expect(
      calculateBacktestFeeAdjustedNetProfitUSDT(
        createAveragedPosition(2),
        exit.exitPrice,
      ),
    ).toBeCloseTo(-8, 8);
  });

  it("executes the post-average stop loss in production", async () => {
    const memory = createRescueMemory(2);
    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 97.9),
      config: {
        takeProfitPercent: 5,
        stopLossPercent: 90,
        stopLossUSDT: 0,
        postAverageStopLoss: {
          enabled: true,
          thresholds: [
            { minAveragingCount: 2, maxNetPnlPct: -2, maxNetPnlUsdt: 0 },
          ],
        },
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    expect(exit.category).toBe(TRADE_MESSAGE.sell.POST_AVERAGE_STOP_LOSS);
    expect(exit.reason).toContain("BOTH:POST_AVERAGE_STOP_LOSS");
    expect(memory.positionsSell?.[0].closed?.reason).toBe(
      "POST_AVERAGE_STOP_LOSS",
    );
  });

  it("exits at the configured absolute latest vPoint level", async () => {
    const memory = createMemory();
    memory.volatility!.lastVolatility = [
      {
        id: "BOTTOM[-6]",
        l: "B",
        lvl: -6,
        pct: 5,
        p: 90,
        t: 2,
        vb: 1,
        vq: 90,
      },
    ];

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 100),
      config: {
        exitOnVPointAbsLevel: 6,
        stopLossPercent: 90,
        stopLossUSDT: 0,
        takeProfitPercent: 5,
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // PROD:EXIT_ON_VPOINT_LEVEL
    expect(exit).toMatchObject({
      action: "SELL",
      category: TRADE_MESSAGE.sell.SL,
    });
    expect(exit.reason).toContain("PROD:EXIT_ON_VPOINT_LEVEL");
    expect(memory.positionsSell?.[0].closed?.reason).toBe(
      "EXIT_ON_VPOINT_LEVEL",
    );
  });

  it("disables the absolute vPoint exit at level zero", async () => {
    const memory = createMemory();
    memory.volatility!.lastVolatility = [
      {
        id: "BOTTOM[-8]",
        l: "B",
        lvl: -8,
        pct: 5,
        p: 90,
        t: 2,
        vb: 1,
        vq: 90,
      },
    ];

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 100),
      config: {
        exitOnVPointAbsLevel: 0,
        stopLossPercent: 90,
        stopLossUSDT: 0,
        takeProfitPercent: 5,
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // PROD:EXIT_ON_VPOINT_LEVEL
    expect(exit.action).toBe("HOLD");
    expect(memory.positionsSell).toHaveLength(0);
  });

  it("exits at the default net USDT loss limit", async () => {
    const memory = createMemory();

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 50),
      config: {
        stopLossPercent: 90,
        takeProfitPercent: 5,
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // PROD:STOP_LOSS_BY_USDT_LOSS
    expect(exit).toMatchObject({
      action: "SELL",
      category: TRADE_MESSAGE.sell.SL,
    });
    expect(exit.reason).toContain("PROD:STOP_LOSS_BY_USDT_LOSS");
    expect(memory.positionsSell?.[0].closed?.reason).toBe(
      "STOP_LOSS_BY_USDT_LOSS",
    );
  });

  it("disables the net USDT stop loss at zero", async () => {
    const memory = createMemory();

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 50),
      config: {
        stopLossPercent: 90,
        stopLossUSDT: 0,
        takeProfitPercent: 5,
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // PROD:STOP_LOSS_BY_USDT_LOSS
    expect(exit.action).toBe("HOLD");
    expect(memory.positionsSell).toHaveLength(0);
  });

  it("supports traditional TP and SL percent exits", () => {
    const tpNotYetHitTargetZone = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 106,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: false, // not hit target zone
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 10,
      },
    });

    // BOTH:TRADITIONAL_TP_SL
    expect(tpNotYetHitTargetZone.shouldExit).toBe(false);

    const tp = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 106,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: true,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 10,
      },
    });

    // BOTH:TRADITIONAL_TP_SL
    expect(tp.shouldExit).toBe(true);
    expect(tp.category).toBe(TRADE_MESSAGE.sell.TP);

    const sl = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 89,
      forceSell: false,
      globalLiquidation: false,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 10,
      },
    });

    // BOTH:TRADITIONAL_TP_SL
    expect(sl.shouldExit).toBe(true);
    expect(sl.category).toBe(TRADE_MESSAGE.sell.SL);
  });

  it("uses unlevered price PnL for backtest TP/SL and leveraged PnL for liquidation", () => {
    const leveragedPosition = {
      ...createPosition(),
      exposure: {
        ...createPosition().exposure,
        leverage: 3,
      },
    };
    const modelConfig = {
      takeProfitPercent: 5,
      stopLossPercent: 5,
    };

    const noTp = resolveBacktestExitDecision({
      position: leveragedPosition as any,
      currentPrice: 102,
      forceSell: false,
      globalLiquidation: false,
      modelConfig,
    });

    // BOTH:TRADITIONAL_TP_SL
    expect(noTp.shouldExit).toBe(false);
    expect(noTp.netProfitPercent).toBe(2);

    const noSl = resolveBacktestExitDecision({
      position: leveragedPosition as any,
      currentPrice: 96,
      forceSell: false,
      globalLiquidation: false,
      modelConfig,
    });

    // BOTH:TRADITIONAL_TP_SL
    expect(noSl.shouldExit).toBe(false);
    expect(noSl.netProfitPercent).toBe(-4);

    const liquidated = resolveBacktestExitDecision({
      position: leveragedPosition as any,
      currentPrice: 73,
      forceSell: false,
      globalLiquidation: false,
      modelConfig: {
        ...modelConfig,
        stopLossPercent: 90,
      },
    });

    expect(liquidated.shouldExit).toBe(true);
    expect(liquidated.category).toBe(TRADE_MESSAGE.sell.LIQUIDATED_ISOLATED);
    expect(liquidated.netProfitPercent).toBe(-100);
  });

  it("records the custom force-sell reason in backtest exit decisions", () => {
    const exit = resolveBacktestExitDecision({
      position: {
        ...createPosition(),
        control: {
          forceExit: {
            reason:
              "BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES | free worker",
          },
        },
      },
      currentPrice: 100,
      forceSell: true,
      globalLiquidation: false,
      modelConfig: {
        takeProfitPercent: 5,
      },
    });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(exit.shouldExit).toBe(true);
    expect(exit.message).toContain(
      "BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES",
    );
  });

  it("exits backtest with TP after the volatility target zone is hit", () => {
    const exit = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 102,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: true,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 10,
      },
    });

    // BOTH:VOLATILITY_TARGET_TP
    expect(exit.shouldExit).toBe(true);
    expect(exit.category).toBe(TRADE_MESSAGE.sell.TP);
    expect(exit.netProfitPercent).toBe(2);
  });

  it("applies the fee-adjusted target-zone stop loss in backtest", () => {
    const beforeTarget = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 98.1,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: false,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 20,
        volatilityTargetStopLossPercent: 2,
      },
    });
    const disabled = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 97,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: true,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 20,
        volatilityTargetStopLossPercent: 0,
      },
    });
    const triggered = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 98.1,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: true,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 20,
        volatilityTargetStopLossPercent: 2,
      },
    });

    // BOTH:VOLATILITY_TARGET_SL_VALUE
    expect(beforeTarget.shouldExit).toBe(false);
    expect(disabled.shouldExit).toBe(false);
    expect(triggered).toMatchObject({
      category: TRADE_MESSAGE.sell.SL,
      netProfitPercent: -2,
      shouldExit: true,
    });
    expect(triggered.message).toContain("BOTH:VOLATILITY_TARGET_SL_VALUE");
  });

  it("applies the fee-adjusted target-zone stop loss in production", async () => {
    exchangeMocks.getBothSideFeePercent.mockReturnValueOnce(0.2);
    const memory = createMemory();
    memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "TOP[1]",
          l: "T",
          lvl: 1,
          pct: 3,
          p: 103,
          t: 2,
          vb: 1,
          vq: 103,
        },
      ],
    };

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 98.1),
      config: {
        takeProfitPercent: 5,
        stopLossPercent: 20,
        volatilityTargetStopLossPercent: 2,
        orderType: "taker",
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:VOLATILITY_TARGET_SL_VALUE
    expect(exit.action).toBe("SELL");
    expect(exit.category).toBe(TRADE_MESSAGE.sell.SL);
    expect(exit.profit).toBeCloseTo(-0.021);
    expect(exit.reason).toContain("BOTH:VOLATILITY_TARGET_SL_VALUE");
  });

  it("uses a post-entry BOTTOM as the SHORT target zone", async () => {
    const memory = createMemory();
    memory.positions = [
      createTestPosition({
        direction: "SHORT",
        entryPrice: 100,
        notionalUsdt: 100,
        symbol: "SUI",
        tradingMode: TradingMode.SPOT,
      }),
    ];
    memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "BOTTOM[-1]",
          l: "B",
          lvl: -1,
          pct: 3,
          p: 97,
          t: 2,
          vb: 1,
          vq: 97,
        },
      ],
    };

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 102.1),
      config: {
        takeProfitPercent: 5,
        stopLossPercent: 20,
        volatilityTargetStopLossPercent: 2,
        orderType: "taker",
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:VOLATILITY_TARGET_SL_VALUE
    expect(exit.action).toBe("SELL");
    expect(exit.category).toBe(TRADE_MESSAGE.sell.SL);
  });

  it.each([
    { count: 0, netPnlPercent: 10, expected: false },
    { count: 1, netPnlPercent: 0.499, expected: false },
    { count: 1, netPnlPercent: 0.5, expected: true },
    { count: 2, netPnlPercent: 0, expected: true },
    { count: 2, netPnlPercent: 0.001, expected: true },
    { count: 3, netPnlPercent: -0.501, expected: false },
    { count: 3, netPnlPercent: -0.5, expected: true },
    { count: 4, netPnlPercent: -0.5, expected: true },
  ])(
    "applies the rescue net-PnL boundary after $count averaging executions",
    ({ count, netPnlPercent, expected }) => {
      const result = postAverageRescue.evaluate({
        currentPrice: 110,
        direction: "LONG",
        lastVolatilityPrice: 100,
        netPnlPercent,
        position: createAveragedPosition(count),
      });

      // BOTH:POST_AVERAGE_RESCUE_EXIT
      expect(result.shouldExit).toBe(expected);
    },
  );

  it("uses the greatest configured averaging threshold reached", () => {
    const config = {
      enabled: true,
      thresholds: [
        { minAveragingCount: 1, minNetPnlPct: 2 },
        { minAveragingCount: 3, minNetPnlPct: -1 },
      ],
    };

    const afterTwo = postAverageRescue.evaluate({
      config,
      currentPrice: 110,
      direction: "LONG",
      lastVolatilityPrice: 100,
      netPnlPercent: 1,
      position: createAveragedPosition(2),
    });
    const afterFour = postAverageRescue.evaluate({
      config,
      currentPrice: 110,
      direction: "LONG",
      lastVolatilityPrice: 100,
      netPnlPercent: -1,
      position: createAveragedPosition(4),
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(afterTwo.minimumNetPnlPercent).toBe(2);
    expect(afterTwo.shouldExit).toBe(false);
    expect(afterFour.minimumNetPnlPercent).toBe(-1);
    expect(afterFour.shouldExit).toBe(true);
  });

  it("does not request a rescue exit when the rule is disabled", () => {
    const result = postAverageRescue.evaluate({
      config: {
        enabled: false,
        thresholds: [{ minAveragingCount: 1, minNetPnlPct: -100 }],
      },
      currentPrice: 110,
      direction: "LONG",
      lastVolatilityPrice: 100,
      netPnlPercent: 10,
      position: createAveragedPosition(1),
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(result.minimumNetPnlPercent).toBeUndefined();
    expect(result.shouldExit).toBe(false);
  });

  it.each([
    { currentPrice: 110, direction: "LONG" as const },
    { currentPrice: 90, direction: "SHORT" as const },
  ])(
    "requires favorable $direction distance for the rescue exit",
    ({ currentPrice, direction }) => {
      const result = postAverageRescue.evaluate({
        currentPrice,
        direction,
        lastVolatilityPrice: 100,
        netPnlPercent: 1,
        position: createAveragedPosition(1),
      });

      // BOTH:POST_AVERAGE_RESCUE_EXIT
      expect(result.shouldExit).toBe(true);
    },
  );

  it("keeps backtest open when the post-average rescue exit is disabled", () => {
    const exit = resolveBacktestExitDecision({
      position: createAveragedPosition(1) as any,
      currentPrice: 102,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: false,
      lastVolatilityPrice: 90,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 10,
        postAverageRescueExit: {
          enabled: false,
          thresholds: [{ minAveragingCount: 1, minNetPnlPct: -100 }],
        },
      },
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(exit.shouldExit).toBe(false);
  });

  it("applies custom post-average rescue thresholds in backtest", () => {
    const baseParams = {
      position: createAveragedPosition(1) as any,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: false,
      lastVolatilityPrice: 90,
      modelConfig: {
        takeProfitPercent: 5,
        stopLossPercent: 10,
        postAverageRescueExit: {
          enabled: true,
          thresholds: [{ minAveragingCount: 1, minNetPnlPct: 2 }],
        },
      },
    };

    const belowCustomThreshold = resolveBacktestExitDecision({
      ...baseParams,
      currentPrice: 101,
    });
    const atCustomThreshold = resolveBacktestExitDecision({
      ...baseParams,
      currentPrice: 102.21,
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(belowCustomThreshold.shouldExit).toBe(false);
    expect(atCustomThreshold.shouldExit).toBe(true);
    expect(atCustomThreshold.category).toBe(
      TRADE_MESSAGE.sell.POST_AVERAGE_RESCUE_EXIT,
    );
  });

  it("requires a valid latest-vPoint distance in every rescue tier", () => {
    const result = postAverageRescue.evaluate({
      currentPrice: 100,
      direction: "LONG",
      lastVolatilityPrice: undefined,
      netPnlPercent: 1,
      position: createAveragedPosition(3),
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(result.shouldExit).toBe(false);
  });

  it.each([
    { count: 1, currentPrice: 100.4 },
    { count: 2, currentPrice: 100.19 },
    { count: 3, currentPrice: 99.69 },
  ])(
    "keeps backtest open below the rescue tier after $count averaging executions",
    ({ count, currentPrice }) => {
      const exit = resolveBacktestExitDecision({
        position: createAveragedPosition(count) as any,
        currentPrice,
        forceSell: false,
        globalLiquidation: false,
        hasHitTargetZone: false,
        lastVolatilityPrice: 90,
        modelConfig: {
          takeProfitPercent: 5,
          stopLossPercent: 10,
        },
      });

      // BOTH:POST_AVERAGE_RESCUE_EXIT
      expect(exit.shouldExit).toBe(false);
    },
  );

  it("keeps production open when the post-average rescue exit is disabled", async () => {
    const memory = createRescueMemory(1);

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 102),
      config: {
        ...rescueExitConfig,
        postAverageRescueExit: {
          enabled: false,
          thresholds: [{ minAveragingCount: 1, minNetPnlPct: -100 }],
        },
      },
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(exit.action).toBe("HOLD");
    expect(memory.positions).toHaveLength(1);
    expect(memory.positionsSell).toHaveLength(0);
  });

  it("applies custom post-average rescue thresholds in production", async () => {
    const config: TradingModelConfig = {
      ...rescueExitConfig,
      postAverageRescueExit: {
        enabled: true,
        thresholds: [{ minAveragingCount: 1, minNetPnlPct: 2 }],
      },
    };
    const belowThresholdMemory = createRescueMemory(1);
    const atThresholdMemory = createRescueMemory(1);

    const belowCustomThreshold = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 101),
      config,
      memory: belowThresholdMemory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });
    const atCustomThreshold = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 102),
      config,
      memory: atThresholdMemory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(belowCustomThreshold.action).toBe("HOLD");
    expect(atCustomThreshold.action).toBe("SELL");
    expect(atCustomThreshold.category).toBe(
      TRADE_MESSAGE.sell.POST_AVERAGE_RESCUE_EXIT,
    );
  });

  it.each([
    { count: 1, currentPrice: 101.21, expectedNetPnl: 1.01 },
    { count: 2, currentPrice: 100.21, expectedNetPnl: 0.01 },
    { count: 3, currentPrice: 99.71, expectedNetPnl: -0.49 },
  ])(
    "exits backtest through the rescue tier after $count averaging executions",
    ({ count, currentPrice, expectedNetPnl }) => {
      const exit = resolveBacktestExitDecision({
        position: createAveragedPosition(count) as any,
        currentPrice,
        forceSell: false,
        globalLiquidation: false,
        hasHitTargetZone: false,
        lastVolatilityPrice: 90,
        modelConfig: {
          takeProfitPercent: 5,
          stopLossPercent: 10,
        },
      });

      // BOTH:POST_AVERAGE_RESCUE_EXIT
      expect(exit.shouldExit).toBe(true);
      expect(exit.category).toBe(TRADE_MESSAGE.sell.POST_AVERAGE_RESCUE_EXIT);
      expect(exit.netProfitPercent).toBeCloseTo(expectedNetPnl);
      expect(exit.message).toContain("BOTH:POST_AVERAGE_RESCUE_EXIT");
    },
  );

  it.each([
    { count: 1, currentPrice: 100.49 },
    { count: 2, currentPrice: 99.99 },
    { count: 3, currentPrice: 99.49 },
  ])(
    "keeps production open below the rescue tier after $count averaging executions",
    async ({ count, currentPrice }) => {
      const memory = createRescueMemory(count);

      const exit = await dynamicExit({
        symbol: "SUI",
        current: buildKline(3, currentPrice),
        config: rescueExitConfig,
        memory,
        exchangeType: "tokocrypto",
        tradingMode: TradingMode.SPOT,
      });

      // BOTH:POST_AVERAGE_RESCUE_EXIT
      expect(exit.action).toBe("HOLD");
      expect(memory.positions).toHaveLength(1);
      expect(memory.positionsSell).toHaveLength(0);
    },
  );

  it("does not bypass normal backtest TP for a non-averaged low-TP position", () => {
    const exit = resolveBacktestExitDecision({
      position: createPosition() as any,
      currentPrice: 100.5,
      forceSell: false,
      globalLiquidation: false,
      hasHitTargetZone: false,
      lastVolatilityPrice: 95,
      modelConfig: {
        takeProfitPercent: 3,
        stopLossPercent: 90,
      },
    });

    // BOTH:TRADITIONAL_TP_SL
    expect(exit.shouldExit).toBe(false);
  });

  it("supports production SL Plus trailing profit protection", async () => {
    const memory = createMemory();
    const config: TradingModelConfig = {
      takeProfitPercent: 5,
      stopLossPercent: 90,
      useStopLossPlus: true,
      stopLossPlusTrigger: 1,
      orderType: "taker",
    };

    const activation = await dynamicExit({
      symbol: "SUI",
      current: buildKline(2, 107),
      config,
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });
    expect(activation.action).toBe("HOLD");

    const trailingExit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 104.9),
      config,
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // PROD:SL_PLUS
    expect(trailingExit.action).toBe("SELL");
    expect(trailingExit.category).toBe(TRADE_MESSAGE.sell.SL_PLUS);
    expect(trailingExit.profit).toBeLessThan(0.05);
  });

  it("does not bypass production SL Plus before its activation threshold", async () => {
    const memory = createMemory();
    memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "BOTTOM[-3]",
          l: "B",
          lvl: -3,
          pct: 5,
          p: 90,
          t: 2,
          vb: 1,
          vq: 90,
        },
      ],
    };
    const config: TradingModelConfig = {
      takeProfitPercent: 3,
      stopLossPercent: 90,
      useStopLossPlus: true,
      stopLossPlusTrigger: 1,
      orderType: "taker",
    };

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 100.5),
      config,
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // PROD:SL_PLUS
    expect(exit.action).toBe("HOLD");
    expect(memory.positions).toHaveLength(1);
  });

  it("records the custom force-sell reason in production exit messages", async () => {
    const memory = createMemory();
    memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "B_TEST",
          l: "B",
          lvl: -2,
          pct: 5,
          p: 100,
          t: 0,
          vb: 1,
          vq: 100,
        },
        {
          id: "B_NOT_AVERAGED",
          l: "B",
          lvl: -3,
          pct: 5,
          p: 95,
          t: 1,
          vb: 1,
          vq: 95,
        },
        {
          id: "T_EXIT",
          l: "T",
          lvl: 0,
          pct: 5,
          p: 100,
          t: 2,
          vb: 1,
          vq: 100,
        },
      ],
    };
    memory.positions[0].control = {
      forceExit: {
        reason: "BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES | free worker",
      },
    };
    const config: TradingModelConfig = {
      takeProfitPercent: 5,
      stopLossPercent: 90,
      orderType: "taker",
    };

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(2, 100),
      config,
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(exit.action).toBe("SELL");
    expect(exit.reason).toContain(
      "BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES",
    );
    expect(memory.positionsSell?.[0].closed?.message).toBe(exit.reason);
    // BOTH:POSITION_VPOINT_PATH
    expect(memory.positionsSell?.[0].vPoints).toEqual([
      { id: "B_NOT_AVERAGED", lvl: -3 },
    ]);
  });

  it.each([
    { count: 1, currentPrice: 101, expectedProfit: 0.01 },
    { count: 2, currentPrice: 100.01, expectedProfit: 0.0001 },
    { count: 3, currentPrice: 99.5, expectedProfit: -0.005 },
  ])(
    "exits production through the rescue tier after $count averaging executions",
    async ({ count, currentPrice, expectedProfit }) => {
      const memory = createRescueMemory(count);

      const exit = await dynamicExit({
        symbol: "SUI",
        current: buildKline(3, currentPrice),
        config: rescueExitConfig,
        memory,
        exchangeType: "tokocrypto",
        tradingMode: TradingMode.SPOT,
      });

      // BOTH:POST_AVERAGE_RESCUE_EXIT
      expect(exit.action).toBe("SELL");
      expect(exit.category).toBe(TRADE_MESSAGE.sell.POST_AVERAGE_RESCUE_EXIT);
      expect(exit.profit).toBeCloseTo(expectedProfit);
      expect(memory.positionsSell?.[0].closed?.reason).toBe(
        "POST_AVERAGE_RESCUE_EXIT",
      );
    },
  );

  it("uses the fee-inclusive production net PnL without deducting fees twice", async () => {
    exchangeMocks.getBothSideFeePercent.mockReturnValueOnce(0.2);
    const memory = createRescueMemory(1);

    const exit = await dynamicExit({
      symbol: "SUI",
      current: buildKline(3, 101.2),
      config: rescueExitConfig,
      memory,
      exchangeType: "tokocrypto",
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:POST_AVERAGE_RESCUE_EXIT
    expect(exit.action).toBe("SELL");
    expect(exit.profit).toBeCloseTo(0.01);
    expect(memory.positionsSell?.[0].pnl.netPct).toBeCloseTo(1);
  });
});
