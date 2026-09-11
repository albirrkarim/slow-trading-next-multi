import { fitBacktestEntryMargin, tryOpenBacktestEntry } from "@/lib/dynamic/backtest-volatility/trading";
import type { BacktestConfigDynamic } from "@/lib/dynamic/type-backtest";
import type { DynamicTradeMemory } from "@/lib/dynamic";
import { TradingMode } from "@/lib/exchange";
import { getManualEntrySignal } from "@/components/api/production/utils";
import slowTrading from "@/lib/slowTrading";
import { resolveEntryLeverage } from "@/lib/trading/execute/entry-leverage";
import entryFunding from "@/lib/trading/execute/entry-funding";
import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { SlowTradingModeState } from "@/lib/slowTrading";
import { createTestPosition } from "../fixtures/position";

function createBacktestConfig(
  overrides: Partial<BacktestConfigDynamic> = {},
): BacktestConfigDynamic {
  return {
    startingBalanceUSDT: 100,
    modelConfig: {
      takeProfitPercent: 5,
      stopLossPercent: 10,
      orderType: "taker",
      useStopLossPlus: false,
    },
    tradingMode: TradingMode.SPOT,
    marginMode: "ISOLATED",
    enableWatchLogic: true,
    watchReserveLevels: 2,
    watchMaxNextAveragingLevels: 2,
    watchReservePctAlloc: 2,
    maxOpenPositions: 0,
    maxEntryMargin: 0,
    maxEntryMarginPct: 0,
    ...overrides,
  };
}

function createRuntime() {
  const modelMemoryMap: Record<string, TradingModelMemory> = {
    SUI: {
      positions: [],
      positionsSell: [],
      volatility: {
        symbol: "SUI",
        lastVolatility: [],
      },
    },
    AAVE: {
      positions: [],
      positionsSell: [],
      volatility: {
        symbol: "AAVE",
        lastVolatility: [],
      },
    },
  };
  const dynamicTradeMemory: DynamicTradeMemory = {
    startingBalanceUSDT: 1000,
    quoteAsset: 1000,
    reservedQuoteAsset: 0,
    safeHaven: 0,
    safeHavenRequest: 0,
    safeHavenHistory: [],
    volatilitySnapshots: [],
    priceNormMapOverTime: {},
  };

  return {
    modelMemoryMap,
    dynamicTradeMemory,
    backtestPack: {
      tradeHistoryMap: {
        AAVE: [],
        SUI: [],
      },
    } as any,
  };
}

function createModeState(): SlowTradingModeState {
  return {
    tradeSettings: [
      {
        symbol: "SUI",
        model_memory: {
          positions: [],
          positionsSell: [],
        },
      },
    ],
    dynamicTradeMemory: {
      startingBalanceUSDT: 1000,
      quoteAsset: 1000,
      reservedQuoteAsset: 0,
      safeHaven: 0,
      safeHavenRequest: 0,
      safeHavenHistory: [],
      volatilitySnapshots: [],
      priceNormMapOverTime: {},
    },
  } as SlowTradingModeState;
}

function createEntryRecommendation(overrides: Partial<EntryRecommendation> = {}) {
  return {
    symbol: "SUI",
    l: "B",
    lvl: -3,
    p: 10,
    t: 1,
    id: "entry-1",
    investAmount: 50,
    amountProbab: 1,
    maxLeverage: 1,
    message: "entry SUI",
    ...overrides,
  } as EntryRecommendation;
}

describe("slow specs entry", () => {
  it("fits entry amount to reserve budget and max entry margin", () => {
    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(
      slowTrading.watchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
      }),
    ).toBe(10);

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(
      fitBacktestEntryMargin({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
        config: createBacktestConfig({ maxEntryMargin: 8 }),
      }),
    ).toBe(8);

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(
      fitBacktestEntryMargin({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
        config: createBacktestConfig({ maxEntryMarginPct: 75 }),
      }),
    ).toBe(8);

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(
      fitBacktestEntryMargin({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
        config: createBacktestConfig({
          maxEntryMarginPct: 75,
          maxEntryMargin: 7,
        }),
      }),
    ).toBe(7);
  });

  it("caps the temporary entry sizing budget from 24h quote volume", () => {
    const volume24h = 50_000;

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(
      slowTrading.watchReserve.entry.capSpendableByVolume24h({
        spendableUsdt: 200,
        volume24h,
        maxEntryBased24HourVolPct: 0.2,
      }),
    ).toBe(100);

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(
      slowTrading.watchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 200,
        volume24h,
        maxEntryBased24HourVolPct: 0.2,
      }),
    ).toBe(10);

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(
      fitBacktestEntryMargin({
        desiredMarginUsdt: 50,
        spendableUsdt: 200,
        volume24h,
        config: createBacktestConfig({
          maxEntryBased24HourVolPct: 0.2,
          maxEntryMarginPct: 75,
          maxEntryMargin: 7,
        }),
      }),
    ).toBe(7);
  });

  it("shares the exact production funding blockers with entry diagnostics", () => {
    const requestedMarginUsdt =
      entryFunding.requestedMargin.resolve({
        bypass: false,
        exchangeType: "binance",
        investAmount: 20,
        probability: 0.5,
      });
    const fundingPlan = entryFunding.plan.calculate({
      activePositions: [],
      config: createBacktestConfig({
        maxEntryBased24HourVolPct: 0,
        maxEntryMargin: 10,
        watchReserveLevels: 1,
        watchMaxNextAveragingLevels: 2,
      }),
      direction: "LONG",
      entryLevel: -3,
      feeRate: 0,
      leverage: 1,
      requestedMarginUsdt,
      reservedQuoteAsset: 0,
      spendableQuoteAsset: 59,
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
    expect(requestedMarginUsdt).toBe(10);
    expect(fundingPlan.blockCode).toBe(
      "INSUFFICIENT_BAILOUT_BUFFER",
    );
    expect(fundingPlan.blockReason).toContain(
      "Not enough spendable balance to keep bailout buffer",
    );
  });

  it("reports an adjusted entry below the production minimum", () => {
    const fundingPlan = entryFunding.plan.calculate({
      activePositions: [],
      config: createBacktestConfig({
        enableWatchLogic: false,
        maxEntryBased24HourVolPct: 0,
        maxEntryMargin: 1,
      }),
      direction: "LONG",
      entryLevel: -2,
      feeRate: 0,
      leverage: 1,
      requestedMarginUsdt: 10,
      reservedQuoteAsset: 0,
      spendableQuoteAsset: 100,
      tradingMode: TradingMode.SPOT,
    });

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(fundingPlan.blockCode).toBe("ENTRY_AMOUNT_TOO_SMALL");
    expect(fundingPlan.blockReason).toContain("minimal 2.00");
  });

  it("applies candidate probability to margin before futures leverage", () => {
    const autoRequestedMarginUsdt =
      entryFunding.requestedMargin.resolve({
        bypass: false,
        exchangeType: "binance",
        investAmount: 20,
        probability: 0.75,
      });
    const autoFundingPlan = entryFunding.plan.calculate({
      activePositions: [],
      config: createBacktestConfig({
        enableWatchLogic: false,
        maxEntryBased24HourVolPct: 0,
      }),
      direction: "LONG",
      entryLevel: -3,
      feeRate: 0,
      leverage: 3,
      requestedMarginUsdt: autoRequestedMarginUsdt,
      reservedQuoteAsset: 0,
      spendableQuoteAsset: 20,
      tradingMode: TradingMode.FUTURES,
    });
    const manualRequestedMarginUsdt =
      entryFunding.requestedMargin.resolve({
        bypass: false,
        exchangeType: "binance",
        investAmount: 20,
        probability: 1,
      });
    const manualFundingPlan = entryFunding.plan.calculate({
      activePositions: [],
      config: createBacktestConfig({
        enableWatchLogic: false,
        maxEntryBased24HourVolPct: 0,
      }),
      direction: "LONG",
      entryLevel: -3,
      feeRate: 0,
      leverage: 2,
      requestedMarginUsdt: manualRequestedMarginUsdt,
      reservedQuoteAsset: 0,
      spendableQuoteAsset: 20,
      tradingMode: TradingMode.FUTURES,
    });

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(autoRequestedMarginUsdt).toBe(15);
    expect(autoFundingPlan.estimatedMarginUsdt).toBe(15);
    expect(autoFundingPlan.adjustedNotionalUsdt).toBe(45);
    expect(autoFundingPlan.totalRequiredUsdt).toBe(15);

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(manualRequestedMarginUsdt).toBe(20);
    expect(manualFundingPlan.estimatedMarginUsdt).toBe(20);
    expect(manualFundingPlan.adjustedNotionalUsdt).toBe(40);
    expect(manualFundingPlan.totalRequiredUsdt).toBe(20);
  });

  it("treats max entry margin as margin budget, not futures notional", () => {
    const fundingPlan = entryFunding.plan.calculate({
      activePositions: [],
      config: createBacktestConfig({
        enableWatchLogic: false,
        maxEntryBased24HourVolPct: 0,
        maxEntryMargin: 20,
      }),
      direction: "LONG",
      entryLevel: -3,
      feeRate: 0,
      leverage: 2,
      requestedMarginUsdt: 50,
      reservedQuoteAsset: 0,
      spendableQuoteAsset: 100,
      tradingMode: TradingMode.FUTURES,
    });

    // BOTH:ADJUST_ENTRY_AMOUNT
    expect(fundingPlan.estimatedMarginUsdt).toBe(20);
    expect(fundingPlan.adjustedNotionalUsdt).toBe(40);
  });

  it("does not open a second active position for the same coin", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig();

    const firstEntry = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation(),
    });
    const secondEntry = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 2,
      config,
      recommend: createEntryRecommendation({
        id: "entry-2",
        t: 2,
      }),
    });

    // BOTH:ONLY_ONE_ACTIVE_POSITION_PER_COIN
    expect(firstEntry).toBe(true);
    expect(secondEntry).toBe(false);
    expect(runtime.modelMemoryMap.SUI.positions).toHaveLength(1);
    expect(runtime.modelMemoryMap.SUI.positions[0].opened).toMatchObject({
      reason: "COMMON",
      message: "entry SUI",
    });
  });

  it("blocks a backtest entry when the portfolio reaches the position cap", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig({
      maxOpenPositions: 1,
    });
    const firstEntry = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation(),
    });
    const balanceAfterFirstEntry = runtime.dynamicTradeMemory.quoteAsset;
    const secondEntry = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 2,
      config,
      recommend: createEntryRecommendation({
        symbol: "AAVE",
        id: "aave-entry",
        t: 2,
      }),
    });

    // BOTH:MAX_OPEN_POSITIONS_ENTRY_GUARD
    expect(firstEntry).toBe(true);
    expect(secondEntry).toBe(false);
    expect(runtime.modelMemoryMap.AAVE.positions).toHaveLength(0);
    expect(runtime.dynamicTradeMemory.quoteAsset).toBe(balanceAfterFirstEntry);
  });

  it("keeps the backtest position guard disabled when configured as zero", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig({
      maxOpenPositions: 0,
    });

    const firstEntry = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation(),
    });
    const secondEntry = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 2,
      config,
      recommend: createEntryRecommendation({
        symbol: "AAVE",
        id: "aave-entry",
        t: 2,
      }),
    });

    // BOTH:MAX_OPEN_POSITIONS_ENTRY_GUARD
    expect(firstEntry).toBe(true);
    expect(secondEntry).toBe(true);
    expect(runtime.modelMemoryMap.SUI.positions).toHaveLength(1);
    expect(runtime.modelMemoryMap.AAVE.positions).toHaveLength(1);
  });

  it("filters entry signals whose volatility point is already used", () => {
    const modeState = createModeState();
    modeState.tradeSettings[0].model_memory.volatility = {
      symbol: "SUI",
      lastVolatility: [
        createEntryRecommendation({ id: "entry-1", used: true }),
        createEntryRecommendation({ id: "entry-2", t: 2, used: false }),
      ],
    } as any;

    const filtered =
      slowTrading.signals.filterSignalsWithUnusedVolatilityPointId(modeState, [
        createEntryRecommendation({ id: "entry-1" }),
        createEntryRecommendation({ id: "entry-2", t: 2 }),
      ]);

    // BOTH:ENTRY_ONLY_IN_UNIQUE_VOLATILITY_POINT_ID
    expect(filtered.map((item) => item.id)).toEqual(["entry-2"]);
  });

  it("filters entry signals using the configured minimum actionable level", () => {
    const signals = [
      createEntryRecommendation({ id: "entry-neg-1", lvl: -1 }),
      createEntryRecommendation({ id: "entry-zero", lvl: 0 }),
      createEntryRecommendation({ id: "entry-pos-1", lvl: 1 }),
      createEntryRecommendation({ id: "entry-neg-2", lvl: -2 }),
      createEntryRecommendation({ id: "entry-pos-2", lvl: 2 }),
    ];

    expect(
      slowTrading.signals
        .filterSignalsWithActionableVolatilityLevel(signals)
        .map((item) => item.id),
    ).toEqual([
      "entry-neg-2",
      "entry-pos-2",
    ]);
    expect(
      slowTrading.signals
        .filterSignalsWithActionableVolatilityLevel(signals, 1)
        .map((item) => item.id),
    ).toEqual([
      "entry-neg-1",
      "entry-pos-1",
      "entry-neg-2",
      "entry-pos-2",
    ]);
  });

  it("creates manual production entry signals at configured level 1", () => {
    const signals = getManualEntrySignal({
      MOVR: {
        justBuy: true,
        positions: [],
        positionsSell: [],
        volatility: {
          symbol: "MOVR",
          lastVolatility: [
            createEntryRecommendation({
              id: "movr-level-1",
              l: "T",
              lvl: 1,
              symbol: "MOVR",
            }),
          ],
        },
      } as TradingModelMemory,
    }, 1);

    // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
    expect(signals).toHaveLength(1);
    expect(signals[0].lvl).toBe(1);
  });

  it("opens a backtest entry at configured level 1", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig({
      minActionableAbsoluteLevel: 1,
    });

    const didOpen = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation({
        id: "entry-level-1",
        lvl: -1,
      }),
    });

    // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
    expect(didOpen).toBe(true);
    expect(runtime.modelMemoryMap.SUI.positions).toHaveLength(1);
  });

  it("does not reopen a closed backtest trade on the same volatility point id", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig();
    runtime.modelMemoryMap.SUI.volatility = {
      symbol: "SUI",
      lastVolatility: [
        createEntryRecommendation({ id: "entry-1", used: true }),
      ],
    } as any;

    const didOpen = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 3,
      config,
      recommend: createEntryRecommendation({ id: "entry-1", t: 3 }),
    });

    // BOTH:ENTRY_ONLY_IN_UNIQUE_VOLATILITY_POINT_ID
    expect(didOpen).toBe(false);
    expect(runtime.modelMemoryMap.SUI.positions).toHaveLength(0);
  });

  it("marks a volatility point as used after a successful backtest entry", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig();
    const volatilityPoint = createEntryRecommendation({ id: "entry-1" });
    runtime.modelMemoryMap.SUI.volatility = {
      symbol: "SUI",
      lastVolatility: [volatilityPoint],
    } as any;

    const didOpen = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 3,
      config,
      recommend: createEntryRecommendation({ id: "entry-1", t: 3 }),
    });

    // BOTH:ENTRY_ONLY_IN_UNIQUE_VOLATILITY_POINT_ID
    expect(didOpen).toBe(true);
    expect(volatilityPoint.used).toBe(true);
  });

  it("blocks unreserved watch spending when only reserved balance remains", () => {
    // BOTH:HAVE_ENOUGH_TO_RESERVED
    expect(
      slowTrading.watchReserve.balance.canSpendWatchStepMargin({
        step: {
          level: -6,
          marginUsdt: 180,
          allocationPct: 2,
          status: "UNRESERVED",
        },
        quoteAsset: 200,
        reservedQuoteAsset: 100,
        minimalUsdt: 2,
      }),
    ).toBe(false);
  });

  it("rejects a new entry when it would consume the spendable bailout buffer", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig({
      enableWatchLogic: false,
    });
    runtime.dynamicTradeMemory.quoteAsset = 2000;
    runtime.modelMemoryMap.AAVE.positions.push(
      createTestPosition({
        symbol: "AAVE",
        averaging: {
          entryLevel: -3,
          lastHandledLevel: -3,
          reserveBaseMarginUsdt: 99,
          reservedRemainingMarginUsdt: 0,
          steps: [
            {
              level: -6,
              marginUsdt: 1782,
              allocationPct: 2,
              status: "UNRESERVED",
            },
          ],
        },
      }),
    );

    const didOpen = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation({
        investAmount: 1000,
      }),
    });

    // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
    expect(didOpen).toBe(false);
    expect(runtime.modelMemoryMap.SUI.positions).toHaveLength(0);
    expect(runtime.dynamicTradeMemory.quoteAsset).toBe(2000);
  });

  it("preserves the projected new position bailout before its first entry", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig({
      maxEntryMargin: 20,
      watchMaxNextAveragingLevels: 2,
      watchReserveLevels: 1,
    });
    runtime.dynamicTradeMemory.quoteAsset = 179;

    const didOpen = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation({
        investAmount: 20,
      }),
    });

    // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
    expect(didOpen).toBe(false);
    expect(runtime.modelMemoryMap.SUI.positions).toHaveLength(0);
    expect(runtime.dynamicTradeMemory.quoteAsset).toBe(179);
  });

  it("uses one leverage calculation for production and backtest entry", () => {
    const entrySignal = createEntryRecommendation({
      amountProbab: 1,
      maxLeverage: 10,
    });

    // BOTH:LEVERAGE_CALCULATION
    expect(
      resolveEntryLeverage({
        entrySignal,
        tradingMode: TradingMode.FUTURES,
        config: { maxLeverage: 2 },
      }),
    ).toBe(2);

    // BOTH:LEVERAGE_CALCULATION
    expect(
      resolveEntryLeverage({
        entrySignal: createEntryRecommendation({
          amountProbab: 1,
          maxLeverage: 1,
        }),
        tradingMode: TradingMode.FUTURES,
        config: { maxLeverage: 3 },
      }),
    ).toBe(1);

    // BOTH:LEVERAGE_CALCULATION
    expect(
      resolveEntryLeverage({
        entrySignal: createEntryRecommendation({
          amountProbab: 0.3,
          maxLeverage: 1,
        }),
        tradingMode: TradingMode.FUTURES,
        config: {
          exactLeverage: 6,
          maxLeverage: 2,
        },
      }),
    ).toBe(6);
  });

  it("opens backtest futures entries with the shared leverage calculation", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig({
      tradingMode: TradingMode.FUTURES,
      maxLeverage: 2,
      enableWatchLogic: false,
    });

    const didOpen = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation({
        amountProbab: 1,
        maxLeverage: 10,
      }),
    });

    // BOTH:LEVERAGE_CALCULATION
    expect(didOpen).toBe(true);
    expect(runtime.modelMemoryMap.SUI.positions[0].exposure.leverage).toBe(2);
  });

  it("opens backtest futures entries with exactLeverage", () => {
    const runtime = createRuntime();
    const config = createBacktestConfig({
      tradingMode: TradingMode.FUTURES,
      exactLeverage: 6,
      maxLeverage: 2,
      enableWatchLogic: false,
    });

    const didOpen = tryOpenBacktestEntry({
      ...runtime,
      currentTimeMs: 1,
      config,
      recommend: createEntryRecommendation({
        amountProbab: 0.3,
        maxLeverage: 1,
      }),
    });

    // BOTH:LEVERAGE_CALCULATION
    expect(didOpen).toBe(true);
    expect(runtime.modelMemoryMap.SUI.positions[0].exposure.leverage).toBe(6);
  });
});
