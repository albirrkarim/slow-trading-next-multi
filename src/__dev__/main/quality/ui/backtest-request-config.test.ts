import { describe, expect, it } from "vitest";

import {
  DEFAULT_BACKTEST_CONFIG,
  type BacktestConfig,
} from "@/components/dev/DynamicTrade/Config";
import { normalizeBacktestConfig } from "@/components/dev/DynamicTrade/MainPage";
import backtestRequestConfig from "@/components/dev/DynamicTrade/backtest-request-config";
import { TradingMode } from "@/lib/exchange";

describe("dynamic backtest request config", () => {
  it("forwards the complete UI runtime configuration", () => {
    const modelConfig = {
      ...DEFAULT_BACKTEST_CONFIG.modelConfig,
      minimalAssetOnTrade: 600,
      postAverageRescueExit: {
        enabled: true,
        thresholds: [
          { minAveragingCount: 1, minNetPnlPct: 0.5 },
          { minAveragingCount: 2, minNetPnlPct: 0 },
          { minAveragingCount: 3, minNetPnlPct: -0.5 },
        ],
      },
      postAverageStopLoss: {
        enabled: true,
        thresholds: [
          { minAveragingCount: 2, maxNetPnlPct: -2, maxNetPnlUsdt: 0 },
        ],
      },
      safePercentPerMonth: 0,
      safeUSDTPerMonth: 10,
      stopLossPercent: 15,
      takeProfitPercent: 1.1,
      useStopLossPlus: true,
      volatilityTargetStopLossPercent: 0.5,
    };
    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      adaptiveAveraging: {
        enabled: true,
        maxMultiplier: 7,
        minProjectedProfitPct: 2.5,
      },
      averagingRescueProjectionGuardEnabled: false,
      enableWatchLogic: true,
      exactLeverage: 5,
      exitSidewaysToFreeWorkersForStrongCandidates: true,
      marginMode: "CROSS",
      maxEntryBased24HourVolPct: 0.3,
      maxEntryMargin: 12,
      maxEntryMarginPct: 4,
      maxLeverage: 8,
      maxOpenPositions: 6,
      minActionableAbsoluteLevel: 1,
      modelConfig,
      startingBalanceUSDT: 500,
      tradingMode: TradingMode.FUTURES,
      watchMaxNextAveragingLevels: 3,
      watchReserveLevels: 1,
      watchReservePctAlloc: 3,
    };

    const runtimeConfig = backtestRequestConfig.config.build(config);

    // BTEST:BACKTEST_ENTRY_CONFIG_FORWARDING
    expect(runtimeConfig).toEqual({
      adaptiveAveraging: config.adaptiveAveraging,
      averagingRescueProjectionGuardEnabled: false,
      enableWatchLogic: true,
      exactLeverage: 5,
      exitSidewaysToFreeWorkersForStrongCandidates: true,
      marginMode: "CROSS",
      maxEntryBased24HourVolPct: 0.3,
      maxEntryMargin: 12,
      maxEntryMarginPct: 4,
      maxLeverage: 8,
      maxOpenPositions: 6,
      minActionableAbsoluteLevel: 1,
      modelConfig,
      startingBalanceUSDT: 500,
      tradingMode: TradingMode.FUTURES,
      watchMaxNextAveragingLevels: 3,
      watchReserveLevels: 1,
      watchReservePctAlloc: 3,
    });
  });

  it("forwards entry-level and leverage settings to the runtime", () => {
    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      exactLeverage: 5,
      maxLeverage: 7,
      minActionableAbsoluteLevel: 1,
    };

    const runtimeConfig = backtestRequestConfig.config.build(config);

    // BTEST:BACKTEST_ENTRY_CONFIG_FORWARDING
    expect(runtimeConfig).toMatchObject({
      exactLeverage: 5,
      maxLeverage: 7,
      minActionableAbsoluteLevel: 1,
    });
  });

  it("normalizes invalid entry-level and leverage settings at the request boundary", () => {
    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      exactLeverage: -5,
      maxLeverage: -7,
      minActionableAbsoluteLevel: 0,
    };

    const runtimeConfig = backtestRequestConfig.config.build(config);

    // BTEST:BACKTEST_ENTRY_CONFIG_FORWARDING
    expect(runtimeConfig).toMatchObject({
      exactLeverage: 0,
      maxLeverage: 0,
      minActionableAbsoluteLevel: 1,
    });
  });

  it("loads nested server-payload config values into the UI config", () => {
    const normalized = normalizeBacktestConfig({
      decisionEngineVersion: "decision.v20",
      range: "6month",
      symbols: ["AAVE", "ARB"],
      config: {
        exactLeverage: 5,
        minActionableAbsoluteLevel: 1,
        startingBalanceUSDT: 700,
        tradingMode: TradingMode.FUTURES,
        watchReserveLevels: 1,
        modelConfig: {
          takeProfitPercent: 1.1,
          stopLossPercent: 15,
        },
      },
    });

    expect(normalized).toMatchObject({
      decisionEngineVersion: "decision.v20",
      exactLeverage: 5,
      minActionableAbsoluteLevel: 1,
      range: "6month",
      startingBalanceUSDT: 700,
      symbols: ["AAVE", "ARB"],
      tradingMode: TradingMode.FUTURES,
      watchReserveLevels: 1,
      modelConfig: {
        takeProfitPercent: 1.1,
        stopLossPercent: 15,
      },
    });
  });

  it("loads a saved-history backtestConfig wrapper", () => {
    const normalized = normalizeBacktestConfig({
      id: "saved-config",
      backtestConfig: {
        ...DEFAULT_BACKTEST_CONFIG,
        decisionEngineVersion: "decision.v20",
        exactLeverage: 4,
        minActionableAbsoluteLevel: 1,
      },
    });

    expect(normalized).toMatchObject({
      decisionEngineVersion: "decision.v20",
      exactLeverage: 4,
      minActionableAbsoluteLevel: 1,
    });
  });
});
