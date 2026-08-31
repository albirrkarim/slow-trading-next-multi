import slowTrading, { type SlowTradingModeState } from "@/lib/slowTrading";
import { sellPosition } from "@/lib/trading/models/utils";
import fs from "fs-extra";
import { createTestPosition } from "../fixtures/position";

function createModeState(): SlowTradingModeState {
  return {
    tradeSettings: [
      {
        symbol: "SUI",
        model_memory: {
          positions: [
            createTestPosition({
              executionMode: "live",
              symbol: "SUI",
              entryPrice: 10,
              entryTime: Date.UTC(2026, 0, 1),
              notionalUsdt: 10,
              quantity: 1,
              direction: "LONG",
            }),
          ],
          positionsSell: [],
        },
      },
    ] as any,
    dynamicTradeMemory: {} as any,
  };
}

describe("slow specs runtime", () => {
  it("defaults all production stage intervals", () => {
    const runtime = slowTrading.storage.data.createDefault().runtime;

    // PROD:SPEEDUP_STAGE
    expect(runtime.speedupStageIntervalMinutes).toBe(1);
    expect(runtime.speedupStagePositivePnlThresholdPct).toBe(1.5);
    expect(runtime.speedupStageNegativePnlThresholdPct).toBe(1.5);
    expect(runtime.speedupStageTakeProfitOffsetPct).toBe(0.5);
    // PROD:STANDARD_MONITORING_STAGE
    expect(runtime.standardMonitoringStageIntervalMinutes).toBe(5);
    // PROD:MANAGEMENT_STAGE
    expect(runtime.managementStageIntervalMinutes).toBe(5);
    // PROD:CAPTURE_ENTRY_STAGE
    expect(runtime.captureEntryStageIntervalMinutes).toBe(5);
    // PROD:BLACK_SWAN_RISK_SENTINEL
    expect(runtime.blackSwanStageIntervalMinutes).toBe(1);
  });

  it("runs the five configurable production stage schedulers", async () => {
    const runnerSource = await fs.readFile("src/lib/slowTrading/runner.ts", "utf8");

    // PROD:SPEEDUP_STAGE
    // PROD:STANDARD_MONITORING_STAGE
    // PROD:MANAGEMENT_STAGE
    // PROD:CAPTURE_ENTRY_STAGE
    expect(slowTrading.stages.order).toEqual([
      "risk-sentinel",
      "speedup",
      "standard-monitoring",
      "management",
      "capture-entry",
    ]);
    expect(runnerSource).toContain("slowTradingStages.order");
    expect(runnerSource).toContain("getMinutes(storage.runtime, stage)");
    expect(runnerSource).toContain('stage === "management"');
    expect(runnerSource).toContain('stage === "risk-sentinel"');
  });

  it("partitions coins into mutually exclusive production stages", () => {
    const modeState = createModeState();
    const speedupPosition = modeState.tradeSettings[0].model_memory.positions![0];
    speedupPosition.pnl.netPct = -1.5;
    const standardPosition = createTestPosition({
      executionMode: "live",
      symbol: "AAVE",
      entryPrice: 10,
      entryTime: Date.UTC(2026, 0, 1),
      notionalUsdt: 10,
      quantity: 1,
      direction: "LONG",
    });
    standardPosition.pnl.netPct = 1.49;
    modeState.tradeSettings.push(
      {
        symbol: "AAVE",
        model_memory: { positions: [standardPosition], positionsSell: [] },
      } as any,
      {
        symbol: "BTC",
        model_memory: { positions: [], positionsSell: [] },
      } as any,
    );

    // PROD:SPEEDUP_STAGE
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI", "AAVE", "BTC"],
        modeState,
        stage: "speedup",
      }),
    ).toEqual(["SUI"]);

    // PROD:STANDARD_MONITORING_STAGE
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI", "AAVE", "BTC"],
        modeState,
        stage: "standard-monitoring",
      }),
    ).toEqual(["AAVE"]);

    // PROD:CAPTURE_ENTRY_STAGE
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI", "AAVE", "BTC"],
        modeState,
        stage: "capture-entry",
      }),
    ).toEqual(["BTC"]);

    // PROD:MANAGEMENT_STAGE
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI", "AAVE", "BTC"],
        modeState,
        stage: "management",
      }),
    ).toEqual(["SUI", "AAVE", "BTC"]);
  });

  it("uses independent positive and negative PnL thresholds for Speedup", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];
    position.pnl.netPct = -2.49;

    // PROD:SPEEDUP_STAGE
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        speedupNegativePnlThresholdPct: 2.5,
        speedupPositivePnlThresholdPct: 4,
        stage: "speedup",
      }),
    ).toEqual([]);
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        speedupNegativePnlThresholdPct: 2.49,
        speedupPositivePnlThresholdPct: 4,
        stage: "speedup",
      }),
    ).toEqual(["SUI"]);

    position.pnl.netPct = -1.488;
    expect(
      slowTrading.stages.position.describeStandardReason({
        negativePnlThresholdPct: 1.5,
        positivePnlThresholdPct: 1.5,
        position,
      }),
    ).toBe(
      "No Speedup rule matched: canonical net PnL -1.488%; PnL rules require >= +1.5% or <= -1.5%",
    );

    position.pnl.netPct = -1.5;
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        speedupNegativePnlThresholdPct: 1.5,
        speedupPositivePnlThresholdPct: 1.5,
        stage: "speedup",
      }),
    ).toEqual(["SUI"]);

    position.pnl.netPct = 3;
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        speedupNegativePnlThresholdPct: 4,
        speedupPositivePnlThresholdPct: 3,
        stage: "speedup",
      }),
    ).toEqual(["SUI"]);
  });

  it("promotes positions when StopLoss+ is armed or net PnL nears take profit", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];
    position.pnl.netPct = 1.49;
    position.pnl.maxUpPct = 2;

    const selectSpeedup = (useStopLossPlus = true) =>
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        speedupNegativePnlThresholdPct: 10,
        speedupPositivePnlThresholdPct: 10,
        speedupTakeProfitOffsetPct: 0.5,
        stage: "speedup",
        takeProfitPercent: 2,
        useStopLossPlus,
      });

    // PROD:SPEEDUP_STAGE
    expect(selectSpeedup()).toEqual(["SUI"]);
    expect(selectSpeedup(false)).toEqual([]);

    position.pnl.maxUpPct = 1;
    position.pnl.netPct = 1.5;
    expect(selectSpeedup(false)).toEqual(["SUI"]);
  });

  it("promotes positions after the direction-specific target vPoint", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];
    position.pnl.netPct = 0;
    modeState.tradeSettings[0].model_memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "T_AFTER_LONG_ENTRY",
          t: position.opened.t + 1,
          l: "T",
          pct: 2,
          p: 11,
          vb: 1,
          vq: 11,
          lvl: 1,
        },
      ],
    } as any;

    const selectSpeedup = () =>
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        speedupNegativePnlThresholdPct: 10,
        speedupPositivePnlThresholdPct: 10,
        stage: "speedup",
        takeProfitPercent: 5,
      });

    // PROD:SPEEDUP_STAGE
    expect(selectSpeedup()).toEqual(["SUI"]);

    position.direction = "SHORT";
    expect(selectSpeedup()).toEqual([]);
    modeState.tradeSettings[0].model_memory.volatility!.lastVolatility!.push({
      id: "B_AFTER_SHORT_ENTRY",
      t: position.opened.t + 2,
      l: "B",
      pct: 2,
      p: 9,
      vb: 1,
      vq: 9,
      lvl: -1,
    } as any);
    expect(selectSpeedup()).toEqual(["SUI"]);
  });

  it("moves averaged positions approaching their target vPoint into Speedup", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];
    position.pnl.netPct = 0;
    position.pnl.markPrice = 103;
    position.strategy.averaging.executions = [
      {
        t: 2,
        level: -2,
        marginUsdt: 10,
        price: 100,
        allocationPct: 2,
      },
    ];
    modeState.tradeSettings[0].model_memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "B_TARGET_APPROACH",
          t: 2,
          l: "B",
          pct: 5,
          p: 100,
          vb: 1,
          vq: 100,
          lvl: -2,
        },
      ],
    } as any;

    // PROD:SPEEDUP_STAGE
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        stage: "speedup",
        volatilityThresholdPct: 5,
      }),
    ).toEqual(["SUI"]);
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        stage: "standard-monitoring",
        volatilityThresholdPct: 5,
      }),
    ).toEqual([]);
  });

  it("requires drift beyond half the threshold and a persisted averaging execution", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];
    position.pnl.netPct = 0;
    position.pnl.markPrice = 102.5;
    modeState.tradeSettings[0].model_memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "B_BOUNDARY",
          t: 2,
          l: "B",
          pct: 5,
          p: 100,
          vb: 1,
          vq: 100,
          lvl: -2,
        },
      ],
    } as any;

    const selectSpeedup = () =>
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        stage: "speedup",
        volatilityThresholdPct: 5,
      });

    // PROD:SPEEDUP_STAGE
    expect(selectSpeedup()).toEqual([]);
    position.pnl.markPrice = 103;
    expect(selectSpeedup()).toEqual([]);

    position.strategy.averaging.executions = [
      {
        t: 2,
        level: -2,
        marginUsdt: 10,
        price: 100,
        allocationPct: 2,
      },
    ];
    expect(selectSpeedup()).toEqual(["SUI"]);
  });

  it("uses falling price as favorable target drift for SHORT positions", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];
    position.direction = "SHORT";
    position.pnl.netPct = 0;
    position.pnl.markPrice = 97;
    position.strategy.averaging.executions = [
      {
        t: 2,
        level: 2,
        marginUsdt: 10,
        price: 100,
        allocationPct: 2,
      },
    ];
    modeState.tradeSettings[0].model_memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "T_TARGET_APPROACH",
          t: 2,
          l: "T",
          pct: 5,
          p: 100,
          vb: 1,
          vq: 100,
          lvl: 2,
        },
      ],
    } as any;

    // PROD:SPEEDUP_STAGE
    expect(
      slowTrading.stages.symbols.select({
        configuredSymbols: ["SUI"],
        modeState,
        stage: "speedup",
        volatilityThresholdPct: 5,
      }),
    ).toEqual(["SUI"]);
  });

  it("bootstraps the runner when the standalone server process starts", async () => {
    const source = await fs.readFile("src/instrumentation.ts", "utf8");

    // PROD:RUNNER_BOOTSTRAP_ON_SERVER_START
    expect(source).toContain("PROD:RUNNER_BOOTSTRAP_ON_SERVER_START");
    expect(source).toContain("@/lib/slowTrading");
    expect(source).toContain("slowTrading.default.runner.get()");
  });

  it("reuses the dev runner singleton unless the implementation changes", async () => {
    const source = await fs.readFile("src/lib/slowTrading/singleton.ts", "utf8");
    const devBranch = source.slice(
      source.indexOf('process.env.NODE_ENV !== "production"'),
      source.indexOf("} else {", source.indexOf('process.env.NODE_ENV !== "production"')),
    );

    // PROD:RUNNER_BOOTSTRAP_ON_SERVER_START
    expect(devBranch).toContain("SLOW_TRADING_RUNNER_IMPLEMENTATION_VERSION");
    expect(devBranch).toContain("existingRunnerVersion !==");
    expect(devBranch).toContain(".stop()");
    expect(devBranch).toContain("!globalForSlowTrading.slowTradingRunner");
  });

  it("updates open-position PnL history once per hourly bucket", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0] as any;

    slowTrading.reporting.modeState.sync({
      modeState,
      latestPriceBySymbol: { SUI: 11 },
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 5),
    });
    slowTrading.reporting.modeState.sync({
      modeState,
      latestPriceBySymbol: { SUI: 12 },
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 55),
    });

    // PROD:MONITORING_OPEN_POSITION
    expect(position.pnl.history).toEqual([
      { t: Date.UTC(2026, 0, 1, 0, 55), pct: 20 },
    ]);

    slowTrading.reporting.modeState.sync({
      modeState,
      latestPriceBySymbol: { SUI: 13 },
      currentTimeMs: Date.UTC(2026, 0, 1, 1, 0),
      monitoring: {
        stage: "standard",
        reasonByPosition: {
          [slowTrading.reporting.positions.monitoringKey("SUI", position)]:
            "No Speedup rule matched",
        },
      },
    });

    // PROD:MONITORING_OPEN_POSITION
    expect(position.pnl.history).toHaveLength(2);
    expect(position.pnl.markPrice).toBe(13);
    expect(position.lastMonitoringStage).toEqual({
      stage: "standard",
      lastUpdated: Date.UTC(2026, 0, 1, 1, 0),
      reason: "No Speedup rule matched",
    });
  });

  it("keeps the last successful monitoring diagnostic when reporting fails", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];
    position.lastMonitoringStage = {
      stage: "speedup",
      lastUpdated: Date.UTC(2026, 0, 1, 1),
      reason: "negative PnL threshold",
    };

    slowTrading.reporting.modeState.sync({
      modeState,
      latestPriceBySymbol: {},
      currentTimeMs: Date.UTC(2026, 0, 1, 2),
      monitoring: {
        stage: "standard",
        reasonByPosition: {
          [slowTrading.reporting.positions.monitoringKey("SUI", position)]:
            "No Speedup rule matched",
        },
      },
    });

    expect(position.lastMonitoringStage).toEqual({
      stage: "speedup",
      lastUpdated: Date.UTC(2026, 0, 1, 1),
      reason: "negative PnL threshold",
    });
  });

  it("retains the last monitoring diagnostic after the position closes", () => {
    const modeState = createModeState();
    const memory = modeState.tradeSettings[0].model_memory;
    const position = memory.positions![0];
    position.lastMonitoringStage = {
      stage: "speedup",
      lastUpdated: Date.UTC(2026, 0, 1, 1),
      reason: "target vPoint hit",
    };

    sellPosition({
      currentKline: [
        Date.UTC(2026, 0, 1, 2),
        "10",
        "11",
        "9",
        "10.5",
        "1",
        Date.UTC(2026, 0, 1, 2, 5),
        "10.5",
        1,
        "1",
        "10.5",
        "0",
        "0",
      ],
      memory,
      index: 0,
      closeReason: "TAKE_PROFIT",
    });

    expect(memory.positions).toHaveLength(0);
    expect(memory.positionsSell?.[0].lastMonitoringStage).toEqual({
      stage: "speedup",
      lastUpdated: Date.UTC(2026, 0, 1, 1),
      reason: "target vPoint hit",
    });
  });

  it("uses the configured PnL history bucket in whole minutes", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0] as any;

    slowTrading.reporting.modeState.sync({
      historyBucketMinutes: 15,
      modeState,
      latestPriceBySymbol: { SUI: 11 },
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 5),
    });
    slowTrading.reporting.modeState.sync({
      historyBucketMinutes: 15,
      modeState,
      latestPriceBySymbol: { SUI: 12 },
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 10),
    });

    expect(position.pnl.history).toEqual([
      { t: Date.UTC(2026, 0, 1, 0, 10), pct: 20 },
    ]);

    slowTrading.reporting.modeState.sync({
      historyBucketMinutes: 15,
      modeState,
      latestPriceBySymbol: { SUI: 13 },
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 15),
    });

    // PROD:MONITORING_OPEN_POSITION
    expect(position.pnl.history).toEqual([
      { t: Date.UTC(2026, 0, 1, 0, 10), pct: 20 },
      { t: Date.UTC(2026, 0, 1, 0, 15), pct: 30 },
    ]);
  });

  it("uses fee-aware floating PnL when exchange type is supplied", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0] as any;

    slowTrading.reporting.modeState.sync({
      exchangeType: "binance",
      modeState,
      latestPriceBySymbol: { SUI: 11 },
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 5),
    });

    // PROD:MONITORING_OPEN_POSITION
    expect(position.pnl.netPct).toBe(9.8);
    expect(position.pnl.netUsdt).toBe(0.98);
    expect(position.fees.entryUsdt).toBe(0);
    expect(position.fees.estimatedExitUsdt).toBe(0.02);
    expect(position.pnl.markPrice).toBe(11);
  });

  it("persists the latest valid funding snapshot during monitoring", () => {
    // PROD:MONITORING_POSITION_FUNDING_RATE
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0];

    slowTrading.reporting.modeState.sync({
      currentTimeMs: Date.UTC(2026, 7, 9, 0, 5),
      exchangeType: "binance",
      fundingRateBySymbol: {
        SUI: {
          nextFundingTime: Date.UTC(2026, 7, 9, 8),
          rate: -0.0005,
          symbol: "SUI_USDT",
          t: Date.UTC(2026, 7, 9, 0, 5),
        },
      },
      latestPriceBySymbol: { SUI: 11 },
      modeState,
    });

    expect(position.funding).toEqual({
      exchange: "binance",
      nextT: Date.UTC(2026, 7, 9, 8),
      rate: -0.0005,
      t: Date.UTC(2026, 7, 9, 0, 5),
    });

    slowTrading.reporting.modeState.sync({
      currentTimeMs: Date.UTC(2026, 7, 9, 0, 10),
      exchangeType: "binance",
      fundingRateBySymbol: {
        SUI: {
          rate: 0.0001,
          symbol: "SUI_USDT",
          t: Date.UTC(2026, 7, 9, 0, 4),
        },
      },
      latestPriceBySymbol: { SUI: 11 },
      modeState,
    });

    expect(position.funding?.rate).toBe(-0.0005);
  });

  it("syncs live open-position size and margin from the exchange", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0] as any;
    position.exposure.averageEntryPrice = 10;
    position.exposure.quantity = 1;
    position.exposure.notionalUsdt = 10;
    position.exposure.marginUsdt = 5;
    position.exposure.leverage = 2;

    const result = slowTrading.exchangeSync.syncLiveOpenPositionsFromExchange({
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 5),
      exchangePositions: [
        {
          symbol: "SUI_USDT",
          originalSymbol: "SUIUSDT",
          side: "LONG",
          amount: 3,
          entryPrice: 9,
          leverage: 3,
          marginUSDT: 9,
          sizeUSDT: 27,
          liquidationPrice: 1,
        },
      ],
      modeState,
    });

    // PROD:SYNC_ENTRY_POSITION_FROM_EXCHANGE
    expect(result.adjustedCount).toBe(1);
    expect(position.exposure.quantity).toBe(3);
    expect(position.exposure.averageEntryPrice).toBe(9);
    expect(position.exposure.leverage).toBe(3);
    expect(position.exposure.marginUsdt).toBe(9);
    expect(position.exposure.notionalUsdt).toBe(27);
  });

  it("moves a missing exchange position into closed history", () => {
    const modeState = createModeState();
    const position = modeState.tradeSettings[0].model_memory.positions![0] as any;
    modeState.tradeSettings[0].model_memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        {
          id: "B_TEST",
          l: "B",
          lvl: -2,
          pct: 5,
          p: 10,
          t: Date.UTC(2025, 11, 31, 23, 55),
          vb: 1,
          vq: 10,
        },
        {
          id: "B_NOT_AVERAGED",
          l: "B",
          lvl: -3,
          pct: 5,
          p: 9,
          t: Date.UTC(2026, 0, 1, 0, 2),
          vb: 1,
          vq: 9,
        },
      ],
    };
    position.strategy.averaging = {
      entryLevel: -1,
      lastHandledLevel: -1,
      reserveBaseMarginUsdt: 10,
      reservedRemainingMarginUsdt: 12,
      steps: [
        {
          level: -2,
          marginUsdt: 12,
          allocationPct: 2,
          status: "RESERVED",
        },
      ],
    };

    const result = slowTrading.exchangeSync.syncLiveOpenPositionsFromExchange({
      currentTimeMs: Date.UTC(2026, 0, 1, 0, 5),
      exchangePositions: [],
      latestPriceBySymbol: { SUI: 11 },
      modeState,
    });

    const memory = modeState.tradeSettings[0].model_memory;

    // PROD:SYNC_ENTRY_POSITION_FROM_EXCHANGE
    expect(result.closedCount).toBe(1);
    expect(result.releasedReserveUSDT).toBe(12);
    expect(memory.positions).toEqual([]);
    expect(memory.positionsSell).toHaveLength(1);
    expect(memory.positionsSell![0].closed?.source).toBe("EXCHANGE");
    expect(memory.positionsSell![0].closed?.reason).toBe("UNKNOWN");
    expect(memory.positionsSell![0].closed?.price).toBe(11);
    // BOTH:POSITION_VPOINT_PATH
    expect(memory.positionsSell![0].vPoints).toEqual([
      { id: "B_NOT_AVERAGED", lvl: -3 },
    ]);
    expect(
      memory.positionsSell![0].strategy.averaging
        .reservedRemainingMarginUsdt,
    ).toBe(0);
    expect(memory.positionsSell![0].strategy.averaging.steps[0].status).toBe(
      "RELEASED",
    );
  });
});
