import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import { tradeLog } from "@/lib/trading/helper/log";
import { fiveMinutesMs, countGrowthOvertime } from "@/lib/dynamic";

import {
  performSafeHavenWithdrawal,
  scheduleSafeHavenRequest,
} from "@lib/dynamic/utils/safeHaven";
import { type VolatilityPoint } from "@lib/dynamic/utils/volatility";
import { predictionEngine } from "@lib/dynamic/utils/volatility/engine";
import type {
  DynamicTradeReturn,
  ExecuteDynamicTradeProps,
} from "@lib/brain/algorithms/type-execute";
import { DECISION_ENGINE_MAP } from "../decisions";
import { doTrade } from "./trade";

/**
 * Execute Dynamic Trade
 *
 * [PRODUCTION] - DONT EDIT AGAIN
 *
 * V4 - Created: 4 Nov 2025 Updated: 12 Nov 2025
 *
 * This function can be used in production API and backtesting
 *
 * It can:
 * - Manage your portfolio: profit overtime, risk management, always save the profit to safe haven (USDT)
 * - Trade based on volatility track
 *
 * Unique Feature:
 * - Bear Proof
 *
 * Decision feature:
 * - Delta time current point and before SUI 2 year acc 73%
 *
 * Strategy:
 * - Rule based but carefully selected
 */
export async function executeDynamicTrade({
  // From api
  symbols,
  modelMemoryMap,
  modelConfig,
  dynamicTradeMemory,
  klinesMap,
  decisionEngineVersion = "decision.v12",
  minActionableAbsoluteLevel,

  // Backtest related reference
  backtest,
}: ExecuteDynamicTradeProps): Promise<DynamicTradeReturn> {
  let currentTimeMs = undefined;

  // A. Prepare
  // A.1 Define current time MS (backtest/ development)
  tradeLog.debug("A.1 Define current time MS (backtest/ development)");
  if (backtest?.currentTimeMsBacktest) {
    currentTimeMs = backtest.currentTimeMsBacktest;
  }

  // A.2 Define current time MS (production)
  tradeLog.debug("A.2 Define current time MS (production)");
  if (currentTimeMs == undefined) {
    const firstSymbol = symbols[0] ?? "BTC";
    // try to fetch
    const klines = await fetchKlinesFunction({
      symbol: firstSymbol + "_USDT",
      interval: "5m",
      simpleTime: "10minute",
    });

    const currentKline = klines.at(-1);
    if (currentKline) {
      currentTimeMs = currentKline[0];
    } else {
      currentTimeMs = Date.now();
    }
  }

  // A.3 Save Haven Logic
  tradeLog.debug("A.3 Save Haven Logic");
  const needToSafe =
    modelConfig.safePercentPerMonth !== undefined ||
    modelConfig.safeUSDTPerMonth !== undefined;

  if (needToSafe) {
    // A.3.1 When its 1st of the month so request the amount to
    const dt = new Date(currentTimeMs);

    if (dt.getDate() == 1) {
      // compute UTC start-of-day for the current day
      const startOfDayUTC = Date.UTC(
        dt.getUTCFullYear(),
        dt.getUTCMonth(),
        dt.getUTCDate(),
        0,
        0,
        0,
        0
      );

      // allow some slack because your loop jumps (use one candle as threshold)
      const slack = fiveMinutesMs;

      // is current time close to midnight (UTC)?
      const isMidnightUTC = Math.abs(currentTimeMs - startOfDayUTC) <= slack;

      if (isMidnightUTC) {
        const currentBalance = countGrowthOvertime({
          timeMs: currentTimeMs,
          dynamicTradeMemory,
          modelMemoryMap,
          klinesMap,
          verbose: true,
        });

        scheduleSafeHavenRequest({
          currentTimeMs,
          config: modelConfig,
          currentAsset: currentBalance.currentAsset,
          memory: dynamicTradeMemory,
        });
      }
    }

    // A.3.2 save money
    performSafeHavenWithdrawal({ currentTimeMs, memory: dynamicTradeMemory });
  }

  // B. BEGIN TO TRADE
  // B.2 Calculate each coin
  tradeLog.debug("B.2 Calculate each coin");
  for (const symbol of symbols) {
    if (!modelMemoryMap[symbol]) {
      modelMemoryMap[symbol] = {
        positions: [],
      };
    }

    const vMemory = modelMemoryMap[symbol]?.volatility;

    if (vMemory) {
      await predictionEngine({
        tradePair: `${symbol}_USDT`,
        memory: vMemory,
        klinesTemp: klinesMap[symbol],
        endTime: currentTimeMs,
        minActionableAbsoluteLevel,
      });
    }
  }

  // B.3 Which coin better?
  tradeLog.debug("B.3 Which coin better? decisionEngine");
  const volatilityPointsMap: Record<string, VolatilityPoint[]> = {};

  for (const symbol of Object.keys(modelMemoryMap)) {
    volatilityPointsMap[symbol] =
      modelMemoryMap[symbol].volatility?.lastVolatility ?? [];
  }

  // if (backtest) {
  //   const levelSnapshot = volatilitySnapshot(
  //     currentTimeMs,
  //     volatilityPointsMap
  //   );
  //   const current = {
  //     timeMs: currentTimeMs,
  //     ...levelSnapshot,
  //   };

  //   const lastVS = dynamicTradeMemory.volatilitySnapshots.at(-1);
  //   if (
  //     !lastVS ||
  //     current.averageLevelTop !== lastVS.averageLevelTop ||
  //     current.averageLevelBottom !== lastVS.averageLevelBottom
  //   ) {
  //     dynamicTradeMemory.volatilitySnapshots.push(current);

  //     // Trim old data to keep only the last month
  //     if (dynamicTradeMemory.volatilitySnapshots.length > MAX_SNAPSHOTS) {
  //       dynamicTradeMemory.volatilitySnapshots.shift(); // remove the oldest snapshot
  //     }
  //   }

  //   if (backtest?.volatilitySnapshots) {
  //     // plot the current volatility
  //     const last = backtest.volatilitySnapshots.at(-1);
  //     if (
  //       !last ||
  //       current.averageLevelTop !== last.averageLevelTop ||
  //       current.averageLevelBottom !== last.averageLevelBottom
  //     ) {
  //       backtest.volatilitySnapshots.push(current);

  //       // const down = getTrendScore(
  //       //   dynamicTradeMemory.volatilitySnapshots,
  //       //   currentTimeMs
  //       // );

  //       // backtest.downTrend?.push({
  //       //   timeMs: currentTimeMs,
  //       //   level: down,
  //       // });

  //     }
  //   }
  // }

  const recommendedPositions = DECISION_ENGINE_MAP[decisionEngineVersion]({
    currentTimeMs,
    volatilityPointsMap,
    modelConfig,
    dynamicTradeMemory,
    modelMemoryMap,
    minActionableAbsoluteLevel,
  });

  if (recommendedPositions.length == 0) {
    // It mean no decision, we keep track the price to just sell it
    const reports = [];

    // But only SELL, dont buy
    for (const symbol of symbols) {
      const modelMemory = modelMemoryMap[symbol];

      if (!modelMemory) {
        tradeLog.debug("no modelMemory for ", symbol);
        continue;
      }

      // TURN ON
      modelMemory.onlySell = true;

      tradeLog.debug("TRY TO SELL ", symbol);
      tradeLog.debug("Memory ", modelMemory.volatility?.symbol);

      const next = await doTrade({
        currentTimeMs,
        symbol,
        modelMemoryMap,
        dynamicTradeMemory,
        modelConfig,
        klinesMap,
        backtest,
      });

      if (next.report) {
        reports.push(next.report);
      }

      // TURN OFF
      modelMemory.onlySell = false;
    }

    return {
      reports,
      continue: true,
    };
  }

  tradeLog.log("recommendedPositions ", recommendedPositions);

  for (const recommend of recommendedPositions) {
    const targetBuySymbol = recommend.symbol ?? "";

    const modelMemory = modelMemoryMap[targetBuySymbol];

    if (!modelMemory) {
      tradeLog.debug("B no modelMemory for ", targetBuySymbol);
      return {
        reports: [],
        continue: true,
      };
    }

    modelMemory.quoteAssetToTrade = recommend.investAmount;

    // it can be BUY or sell
    const next = await doTrade({
      currentTimeMs,
      symbol: targetBuySymbol,
      modelMemoryMap,
      dynamicTradeMemory,
      modelConfig,
      klinesMap,
      backtest,
    });

    tradeLog.log("next.report ", next.report);

    return {
      reports: next.report ? [next.report] : [],
      continue: true,
    };
  }

  return {
    reports: [],
    continue: true,
  };
}
