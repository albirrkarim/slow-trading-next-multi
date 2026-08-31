import type {
  DynamicTradeClosedTrade,
  DynamicTradeBacktestInput,
  DynamicTradeBacktestReturn,
  MultiLinePair,
  SeriesMinimal,
} from "@/components/api/dynamic";
import {
  applyTimeWindow,
  commonEvaluation,
  getCustomSeries,
  growOvertimeToSeries,
  volatilitySnapshotsToSeries,
} from "@/components/api/dynamic";
import { VOLATILITY_FOLDER } from "@/components/api/constants";
import { COLORS_BG, DEFAULT_COLORS } from "@/components/client/constants";
import { deepCopy } from "@/components/client/utils";
import type { LeveledMarkers } from "@/components/LiveDashboard/converter";
import {
  convertPositionIntoEntryExitPair,
  convertVolatilityToLeveledMarkers,
} from "@/components/LiveDashboard/converter";
import { FOLDER } from "@/components/storage";
import { timeMsToReadable } from "@/lib/datasets/utils";
import type { BacktestReturnDynamic, VolatilityPoint } from "@/lib/dynamic";
import { isDevBacktestEnabled } from "@/lib/env/devBacktest";
import { runWithExchangeAccount } from "@/lib/exchange/account-context";
import slowTradingAccountConfig from "@/lib/slowTrading/account-config";
import slowTradingStorage from "@/lib/slowTrading/storage";
import { tradeLog } from "@/lib/trading";
import fs from "fs-extra";
import md5 from "md5";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function dynamicTradeBacktestHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!isDevBacktestEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (req.method === "POST") {
    await dynamicTradeBacktest(req, res);
  } else {
    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

async function dynamicTradeBacktest(req: NextApiRequest, res: NextApiResponse) {
  // A. Initialize
  const params = req.method == "GET" ? req.query : req.body;
  const {
    symbols = ["BTC"],
    upToDateKlines = false,
    upToDateDecisionBacktest = false,
    config,
    algorithm = "dynamic.v4",

    mode = "kline",

    decisionEngineVersion = "decision.v7",

    verbose = true,
    multiAccount = false,
  } = params as DynamicTradeBacktestInput;

  let { range, startTime, endTime } = params as DynamicTradeBacktestInput;

  if (startTime && endTime && range == "custom") {
    range = `${timeMsToReadable(startTime)}_to_${timeMsToReadable(endTime)}`;
  } else {
    startTime = undefined;
    endTime = undefined;
  }

  const tradeLogSession = tradeLog.startSession({
    categories: ["debug"],
    verbose: Boolean(verbose),
  });

  try {
    const [
      { DYNAMIC_ALGORITM_MAP, GET_RECOMMENDATIONS_MAP },
      { DECISION_ENGINE_MAP },
      { getSharpDownRatio },
      { runBacktestVolatilityDynamic },
      { getHistoricalEntrySignal },
      { windowsMs },
      { saveOrGetBacktestResult },
      { default: makeLeaderboard },
    ] = await Promise.all([
      import("@/lib/brain/algorithms"),
      import("@/lib/brain/algorithms/v4/decisions"),
      import("@/lib/brain/algorithms/v4/decisions/v12/feature/utils"),
      import("@/lib/dynamic/backtest-volatility"),
      import("@/lib/dynamic/utils/history"),
      import("@/lib/dynamic/utils/nn/data/features/constants"),
      import("@/lib/dynamic/utils/report"),
      import("@/lib/evaluate/analysis/leaderboard"),
    ]);

    if (!Object.keys(DYNAMIC_ALGORITM_MAP).includes(algorithm)) {
      const data = {
        message: `Unknown dynamic trade algorithm ${algorithm} available are ${Object.keys(
          DYNAMIC_ALGORITM_MAP,
        ).join(", ")}`,
      };

      res.json(data);
      return;
    }

    // We need BTC
    if (!symbols.includes("BTC")) {
      symbols.push("BTC");
    }

    symbols.sort((a, b) => a.localeCompare(b));

    // B. Dynamic backtest
    const enabledAccounts = multiAccount
      ? (await slowTradingStorage.data.load({ modeScope: "active" })).runtime
          .exchangeAccounts.filter((account) => account.enabled)
      : [];
    if (multiAccount && enabledAccounts.length === 0) {
      throw new Error("Enable at least one SLOW account before backtesting.");
    }
    const id = deepCopy({
      algorithm,
      symbols,
      range,
      startTime,
      endTime,
      config,
      mode,
      decisionEngineVersion,
      multiAccount,
      accountSignature: enabledAccounts.map((account) => ({
        slug: account.slug,
        trading: account.trading,
        startingBalanceUSDT: account.sandbox.initialBalanceUSDT,
      })),
    });

    let cached = await saveOrGetBacktestResult({
      id,
    });

    if (!upToDateDecisionBacktest && !upToDateKlines && cached) {
      tradeLog.log("Cached runBacktestDynamic");
    } else {
      tradeLog.log("New runBacktestDynamic");
      let result: BacktestReturnDynamic;
      if (enabledAccounts.length > 0) {
        const accountResults: BacktestReturnDynamic[] = [];
        // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
        for (const account of enabledAccounts) {
          const effectiveConfig = {
            ...slowTradingAccountConfig.trading.toEffectiveConfig(
              id.config as any,
              account,
            ),
            startingBalanceUSDT: account.sandbox.initialBalanceUSDT,
          } as typeof id.config;
          accountResults.push(
            await runWithExchangeAccount(account, () =>
              runBacktestVolatilityDynamic({
                ...id,
                config: effectiveConfig,
                decisionEngine:
                  DECISION_ENGINE_MAP[decisionEngineVersion as string],
                useVolatilityCache: !upToDateKlines,
              }),
            ),
          );
        }
        result = combineAccountBacktests(accountResults);
      } else {
        result = await runBacktestVolatilityDynamic({
          ...id,
          decisionEngine: DECISION_ENGINE_MAP[decisionEngineVersion as string],
          useVolatilityCache: !upToDateKlines,
        });
      }

      await saveOrGetBacktestResult({ id, res: result });
      cached = result;
    }

    if (!cached) {
      const data = {
        message: "something wrong!",
      };
      res.json(data);
      return;
    }

    // C. Reuse volatility events already embedded in the backtest result.
    // BTEST:BACKTEST_VOLATILITY_DATASET
    const rawVolatilityMap: Record<string, VolatilityPoint[]> = {};
    for (const symbol of symbols) {
      rawVolatilityMap[symbol] =
        cached.backtestPack.modelMemoryMap[symbol]?.volatility
          ?.lastVolatility ?? [];
    }
    const commonStart = Math.max(
      ...Object.values(rawVolatilityMap).map((points) => points[0]?.t ?? 0),
    );
    const commonEnd = Math.min(
      ...Object.values(rawVolatilityMap).map(
        (points) => points.at(-1)?.t ?? Number.MAX_SAFE_INTEGER,
      ),
    );
    const commonTime = {
      commonStart,
      commonEnd,
      commonLength: new Set(
        Object.values(rawVolatilityMap).flatMap((points) =>
          points.map((point) => point.t),
        ),
      ).size,
    };

    tradeLog.log("Common Start ", timeMsToReadable(commonTime.commonStart));
    tradeLog.log("Common End ", timeMsToReadable(commonTime.commonEnd));

    symbols.sort();

    const priceSeries: MultiLinePair = {
      series: [],
      names: [],
    };

    // C.1 Trades Series
    const vPointsSeries: MultiLinePair = {
      series: [],
      names: [],
    };
    let firstTradeHappen = 0;
    let endTradeHappen = 0;
    let idx = 0;

    const seriesTrades: SeriesMinimal[][] = [];
    const namesTrades: string[] = [];

    try {
      for (const symbol of symbols) {
        const markers = convertPositionIntoEntryExitPair({
          symbol,
          positions:
            cached.backtestPack.modelMemoryMap[symbol]?.positionsSell ?? [],
          color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
        });

        idx++;

        for (const marker of markers) {
          // tradeLog.log(marker);
          seriesTrades.push(marker);
          namesTrades.push("TRADE " + symbol);
        }
      }
    } catch (error) {
      tradeLog.error(error);
    }

    const lastSeries = cached.backtestPack.growthOvertime.at(-1);
    if (lastSeries) {
      endTradeHappen = Math.floor(lastSeries.timeMs / 1000); // UTC
    }

    const firstSeries = cached.backtestPack.growthOvertime[0];
    if (firstSeries) {
      firstTradeHappen = Math.floor(firstSeries.timeMs / 1000); // UTC
    }

    const firstMarkerSimple = {
      time: firstTradeHappen,
      level: 0,
    };

    const firstMarker: LeveledMarkers = {
      ...firstMarkerSimple,
      // color: "red",
      text: "Initial " + timeMsToReadable(firstTradeHappen * 1000),
    };

    const endMarkerSimple = {
      time: endTradeHappen,
      level: 0,
    };

    const endMarker: LeveledMarkers = {
      ...endMarkerSimple,
      // color: "red",
      text: "End " + timeMsToReadable(endTradeHappen * 1000),
    };

    const firstTradeHappenMs = firstTradeHappen * 1000;
    const endTradeHappenMs = endTradeHappen * 1000;

    // const model = await fs.readJson("storage/nn/models/v3.json");
    // const nn2 = new MultiLayerNN();
    // nn2.load(model);

    // const globalMarketData = await getGlobalMarketData();

    // C.2. Volatility series
    // === NEW SECTION: pre-build volatilityPointsMap ===
    const volatilityPointsMap: Record<string, VolatilityPoint[]> = {};

    for (const symbol of symbols) {
      let vPoints = rawVolatilityMap[symbol];

      if (firstTradeHappen) {
        vPoints = vPoints.filter(
          (e) => e.t >= firstTradeHappenMs && e.t <= endTradeHappenMs,
        );
      }

      volatilityPointsMap[symbol] = vPoints;
    }
    // ===================================================

    tradeLog.log("symbols", symbols);

    idx = 0;
    for (const symbol of symbols) {
      const volatilityPoints = volatilityPointsMap[symbol];

      // if (!volatilityPoints || volatilityPoints.length === 0) continue;

      // save dataset.
      // if (cached.backtestPack.volatilitySnapshots) {
      //   // CREATE DATASET
      //   const datasetForThat = makeDataset({
      //     vPoints: volatilityPoints,
      //     vSnapshots: cached.backtestPack.volatilitySnapshots,
      //     volatilityPointsMap,
      //     globalMarketData,
      //     klinesMap,
      //   });

      //   const datasetFolder = `storage/nn/datasets/${range}`;
      //   await fs.ensureDir(datasetFolder);
      //   await fs.writeJSON(`${datasetFolder}/${symbol}.json`, datasetForThat);

      //   // INFERENCE

      //   // const seriesTradesCoin = [];
      //   // const records = [];

      //   // for (
      //   //   let i = DEFAULT_MAKE_DATASET_OPTS.N_HISTORY,
      //   //     len = volatilityPoints.length;
      //   //   i < len;
      //   //   i++
      //   // ) {
      //   //   const current = volatilityPoints[i];

      //   //   if (current.label == "BOTTOM" && current.level <= -1) {
      //   //     const prevPoints = volatilityPoints.slice(
      //   //       Math.max(0, i - DEFAULT_MAKE_DATASET_OPTS.N_HISTORY),
      //   //       i
      //   //     );

      //   //     const minTime = current.time - DEFAULT_MAKE_DATASET_OPTS.ONE_MONTH_MS;

      //   //     const oneMonthSnaps = cached.backtestPack.volatilitySnapshots.filter(
      //   //       (e) => e.timeMs >= minTime && e.timeMs <= current.time
      //   //     );

      //   //     // ✅ Crop global volatility map for this current point
      //   //     const timeFramedVolatilityPointsMap: Record<
      //   //       string,
      //   //       VolatilityPoint[]
      //   //     > = {};
      //   //     for (const [sym, points] of Object.entries(volatilityPointsMap)) {
      //   //       timeFramedVolatilityPointsMap[sym] = points.filter(
      //   //         (p) => p.t >= minTime && p.t <= current.time
      //   //       );
      //   //     }

      //   //     const vector = makeVector({
      //   //       symbol,
      //   //       current,
      //   //       prevPoints,
      //   //       oneMonthSnaps,
      //   //       volatilityPointsMap: timeFramedVolatilityPointsMap,
      //   //       globalMarketData,
      //   //     });

      //   //     const predProb = nn2.predict(vector);

      //   //     // tradeLog.log("predProb", predProb);

      //   //     if (predProb >= 0.5) {
      //   //       // trade
      //   //       seriesTradesCoin.push({
      //   //         time: Math.floor(current.time / 1000),
      //   //         level: current.level,
      //   //         color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
      //   //         text: "TRADE NN " + symbol + " " + predProb.toFixed(3),
      //   //       });

      //   //       records.push({
      //   //         name: symbol,
      //   //         input: vector,
      //   //         current,
      //   //         prevPoints,
      //   //         oneMonthSnaps,
      //   //         predProb: parseFloat(predProb.toFixed(7)),
      //   //       });
      //   //     }
      //   //   }
      //   // }

      //   // seriesTrades.push(seriesTradesCoin);
      //   // namesTrades.push("TRADE NN " + symbol);

      //   // await fs.writeJson(`storage/nn/evaluation/coins/${symbol}.json`, records);
      // }

      const last15Day = windowsMs["1m"] / 2;

      // PRICE NORMALIZED
      // Find min and max
      // const prices = volatilityPoints.map((d) => d.price);
      // const min = Math.min(...prices);
      // const max = Math.max(...prices);

      // // Normalize
      // const pricesPointsGlobal = volatilityPoints.map((e) => ({
      //   time: Math.floor(e.t / 1000),
      //   level: (e.p - min) / (max - min || 1),
      // }));

      // priceSeries.series.push(pricesPointsGlobal);
      // priceSeries.names.push(symbol + "_global");

      // const memory = {
      //   max: 0,
      //   min: Infinity,
      // };

      // Realtime calculation
      // const priceNormOverTime = [];
      // const pricesPoints: SeriesMinimal[] = [];
      // const downRatioOverTime: SeriesMinimal[] = [];
      // for (const vPoint of volatilityPoints) {
      //   // vPoint

      //   if (vPoint.p < memory.min) {
      //     memory.min = vPoint.p;
      //   }

      //   if (vPoint.p > memory.max) {
      //     memory.max = vPoint.p;
      //   }

      //   const current =
      //     (vPoint.p - memory.min) / (memory.max - memory.min || 1);

      //   const item: PriceNorm = {
      //     t: vPoint.t,
      //     x: memory.max,
      //     n: memory.min,
      //     c: current,
      //   };

      //   priceNormOverTime.push(item);

      //   const cutOff = vPoint.t - last15Day;
      //   const recent = priceNormOverTime.filter((e) => e.t > cutOff);

      //   const downRatio = getSharpDownRatio(recent);
      //   vPoint.message = "DR " + downRatio.toFixed(2);
      //   downRatioOverTime.push({
      //     time: Math.floor(vPoint.t / 1000),
      //     level: downRatio,
      //   });

      //   pricesPoints.push({
      //     time: Math.floor(vPoint.t / 1000),
      //     level: current,
      //   });
      // }

      // priceSeries.series.push(pricesPoints);
      // priceSeries.names.push(symbol);

      // cached.dynamicTradeMemory.priceNormMapOverTime

      // priceSeries.series.push(downRatioOverTime);
      // priceSeries.names.push(symbol + "_DOWN_RATIO");

      if (cached.dynamicTradeMemory.priceNormMapOverTime) {
        const priceNorm =
          cached.backtestPack.priceNormMapOverTime[symbol] ?? [];

        const data = priceNorm.map((e) => ({
          time: Math.floor(e.t / 1000),
          level: e.c,
        }));

        // tradeLog.log("data", data.length);

        const downRatioOverTime: SeriesMinimal[] = [];
        // const upRatioOverTime: SeriesMinimal[] = [];

        for (const item of priceNorm) {
          const cutOff = item.t - last15Day;
          const recent = priceNorm.filter(
            (e) => e.t > cutOff && e.t <= item.t,
          );

          // tradeLog.log("recent ", recent.length);
          const downRatio = getSharpDownRatio(recent);

          downRatioOverTime.push({
            time: Math.floor(item.t / 1000),
            level: downRatio,
          });

          // const upRatio = getSharpUpRatio(recent);

          // upRatioOverTime.push({
          //   time: Math.floor(item.t / 1000),
          //   level: upRatio,
          // });
        }

        // if (symbol !== "BTC") {
        priceSeries.series.push(downRatioOverTime);
        priceSeries.names.push(symbol + "_DOWN_RATIO");

        // priceSeries.series.push(upRatioOverTime);
        // priceSeries.names.push(symbol + "_UP_RATIO");
        // }

        priceSeries.series.push(data);
        priceSeries.names.push(symbol + "_PRICE_NORM");
      }

      const volatilityPointsLeveledMarkers = convertVolatilityToLeveledMarkers(
        symbol,
        volatilityPoints,
        COLORS_BG[idx % COLORS_BG.length],
      );

      if (firstTradeHappen) {
        // Volatility point
        volatilityPointsLeveledMarkers.unshift(firstMarker);
        volatilityPointsLeveledMarkers.push(endMarker);

        vPointsSeries.series.push(volatilityPointsLeveledMarkers);
        vPointsSeries.names.push(symbol);
      }

      idx++;
    }

    vPointsSeries.series.push(...seriesTrades);
    vPointsSeries.names.push(...namesTrades);

    // ============================================================

    const historicalEntrySignal = await getHistoricalEntrySignal({
      volatilityMap: volatilityPointsMap,
      getRecommendations: GET_RECOMMENDATIONS_MAP[decisionEngineVersion],
      exchangeType: (config as any)?.exchangeType ?? "binance",
      minActionableAbsoluteLevel: config.minActionableAbsoluteLevel,
    });

    // applyTimeWindow(
    //   firstMarkerSimple.time,
    //   config.startTime / 1000,
    //   config.endTime / 1000,
    //   true
    // );

    const entryDots = historicalEntrySignal.flat().map((entry) => [
      {
        time: Math.floor(entry.t / 1000),
        level: entry.lvl,
        text: entry.message,
      },
    ]);

    vPointsSeries.names.push(
      ...entryDots.map((e) => `ENTRY ${e[0].level > 0 ? "SHORT" : "LONG"}`),
    );
    vPointsSeries.series.push(...entryDots);

    // ============================================================

    // ============================================================
    // New feature 12 December 2025

    // flaten volatility points time

    // const times = [
    //   ...new Set(
    //     Object.values(volatilityPointsMap) // get arrays for each key
    //       .flat() // flatten them
    //       .map((item) => item.t), // extract `time`
    //   ),
    // ].sort((a, b) => a - b);

    // const maxTop: SeriesMinimal[] = [];
    // const meanTop: SeriesMinimal[] = [];
    // const mean: SeriesMinimal[] = [];
    // const meanBottom: SeriesMinimal[] = [];
    // const minBottom: SeriesMinimal[] = [];
    // const entryBottom: SeriesMinimal[] = [];

    // for (const currentTimeMs of times) {
    //   const cutOff = currentTimeMs - windowsMs["1d"] * 15;
    //   const cropedVMap = cropVolatility(
    //     currentTimeMs,
    //     volatilityPointsMap,
    //     cutOff,
    //   );

    //   // produce the threshold
    //   const thres = meanLevelThresholdFeature(cropedVMap);

    //   // push into vPointsSeries

    //   maxTop.push({
    //     time: Math.floor(currentTimeMs / 1000),
    //     level: thres.maxTop,
    //     color: green[900],
    //   });

    //   meanTop.push({
    //     time: Math.floor(currentTimeMs / 1000),
    //     level: thres.meanTop,
    //     color: green[500],
    //   });

    //   mean.push({
    //     time: Math.floor(currentTimeMs / 1000),
    //     level: thres.mean,
    //     color: grey[900],
    //   });

    //   meanBottom.push({
    //     time: Math.floor(currentTimeMs / 1000),
    //     level: thres.meanBottom,
    //     color: red[500],
    //   });

    //   minBottom.push({
    //     time: Math.floor(currentTimeMs / 1000),
    //     level: thres.minBottom,
    //     color: red[900],
    //   });

    //   entryBottom.push({
    //     time: Math.floor(currentTimeMs / 1000),
    //     level: -Math.ceil(Math.abs(thres.meanTop - 3)),
    //     color: green[500],
    //   });
    // }

    // vPointsSeries.series.push(maxTop);
    // vPointsSeries.names.push("MAX_TOP");

    // vPointsSeries.series.push(meanTop);
    // vPointsSeries.names.push("MEAN_TOP");

    // vPointsSeries.series.push(mean);
    // vPointsSeries.names.push("MEAN");

    // vPointsSeries.series.push(meanBottom);
    // vPointsSeries.names.push("MEAN_BOTTOM");

    // vPointsSeries.series.push(minBottom);
    // vPointsSeries.names.push("MIN_BOTTOM");

    // vPointsSeries.series.push(entryBottom);
    // vPointsSeries.names.push("ENTRY_BOTTOM");

    // ============================================================

    applyTimeWindow(
      priceSeries.series,
      firstMarkerSimple.time,
      endMarkerSimple.time,
    );

    // E. Additional Charts
    tradeLog.log("E. Additional Charts");

    // E.1 Asset growth overtime
    const growthOvertimeSeries = growOvertimeToSeries(
      deepCopy(cached.backtestPack.growthOvertime),
    );

    // E.2 Volatility Snapshot Chart Multi Line
    // E.2.1 Avg top and bottom
    const customSeries = getCustomSeries(cached);

    applyTimeWindow(
      customSeries.series,
      firstMarkerSimple.time,
      endMarkerSimple.time,
    );

    // E.2.3 Level count timeseries
    const vSnapshots = volatilitySnapshotsToSeries(
      deepCopy(cached.backtestPack.volatilitySnapshots ?? []),
    );

    applyTimeWindow(
      vSnapshots.top.series,
      firstMarkerSimple.time,
      endMarkerSimple.time,
    );

    applyTimeWindow(
      vSnapshots.bottom.series,
      firstMarkerSimple.time,
      endMarkerSimple.time,
    );

    // F. Leaderboards Evaluation
    const evaluation = commonEvaluation(symbols, cached);
    const leaderboards = await makeLeaderboard({
      backtestReturn: cached,
      stability: evaluation.stability,
      volatilityMap: rawVolatilityMap,
    });

    // SAve test case
    await fs.ensureDir(FOLDER.production.autoGenerated);
    await fs.writeJson(
      `${FOLDER.production.autoGenerated}/${algorithm}-${range}-${symbols.join(
        "_",
      )}-${md5(JSON.stringify(id)).substring(0, 5)}.json`,
      {
        input: id,
        evaluation,
        leaderboards,
        volatilityDataset: `${VOLATILITY_FOLDER}/binance/${range}`,
      },
    );

    const tradeCountMap: Record<string, number> = {};
    const tradeHistory: DynamicTradeClosedTrade[] = [];
    for (const symbol of symbols) {
      if (symbol == "BTC") {
        continue;
      }

      const closedPositions =
        cached.backtestPack.modelMemoryMap[symbol]?.positionsSell ?? [];
      tradeCountMap[symbol] = cached.backtestPack.tradeHistoryMap[symbol].length;
      tradeHistory.push(
        ...closedPositions.map((position) => ({
          account: position.account,
          symbol: position.symbol ?? symbol,
          entryTime: position.opened.t,
          exitTime: position.closed?.t,
          exitReason: position.closed?.reason ?? "UNKNOWN",
          netProfitUSDT:
            typeof position.pnl.netUsdt === "number" &&
            Number.isFinite(position.pnl.netUsdt)
              ? position.pnl.netUsdt
              : 0,
        })),
      );
    }
    tradeHistory.sort(
      (left, right) =>
        (left.exitTime ?? left.entryTime) -
        (right.exitTime ?? right.entryTime),
    );

    // G. Output
    const data: DynamicTradeBacktestReturn = {
      symbols,
      range,
      startingBalanceUSDT: cached.startingBalanceUSDT,
      tradeHistory,
      tradeCountMap,
      vPointsSeries,
      priceSeries,
      growthOvertimeSeries,
      customSeries,
      vSnapshots,
      evaluation,
      leaderboards,
      commonTime,
    };

    res.json(data);
  } finally {
    tradeLog.endSession(tradeLogSession);
  }
}

/** Combines independent account simulations without merging their capital. */
function combineAccountBacktests(
  results: BacktestReturnDynamic[],
): BacktestReturnDynamic {
  const first = deepCopy(results[0]);
  if (!first) throw new Error("No enabled SLOW accounts are available.");

  first.startingBalanceUSDT = results.reduce(
    (total, result) => total + result.startingBalanceUSDT,
    0,
  );
  first.finalBalance = results.reduce(
    (total, result) => total + result.finalBalance,
    0,
  );
  first.totalTrades = results.reduce(
    (total, result) => total + result.totalTrades,
    0,
  );
  first.config.startingBalanceUSDT = first.startingBalanceUSDT;
  first.dynamicTradeMemory.startingBalanceUSDT = first.startingBalanceUSDT;
  first.dynamicTradeMemory.quoteAsset = results.reduce(
    (total, result) => total + result.dynamicTradeMemory.quoteAsset,
    0,
  );
  first.dynamicTradeMemory.safeHaven = results.reduce(
    (total, result) => total + (result.dynamicTradeMemory.safeHaven ?? 0),
    0,
  );
  first.dynamicTradeMemory.reservedQuoteAsset = results.reduce(
    (total, result) =>
      total + (result.dynamicTradeMemory.reservedQuoteAsset ?? 0),
    0,
  );

  for (const symbol of first.symbols) {
    const memories = results
      .map((result) => result.backtestPack.modelMemoryMap[symbol])
      .filter(Boolean);
    if (memories.length === 0) continue;
    first.backtestPack.modelMemoryMap[symbol] = {
      ...deepCopy(memories[0]),
      positions: memories.flatMap((memory) => memory.positions ?? []),
      positionsSell: memories.flatMap((memory) => memory.positionsSell ?? []),
    };
    first.backtestPack.tradeHistoryMap[symbol] = results.flatMap(
      (result) => result.backtestPack.tradeHistoryMap[symbol] ?? [],
    );
  }

  const growthByTime = new Map<
    number,
    BacktestReturnDynamic["backtestPack"]["growthOvertime"][number]
  >();
  for (const result of results) {
    for (const point of result.backtestPack.growthOvertime) {
      const current = growthByTime.get(point.timeMs);
      if (!current) {
        growthByTime.set(point.timeMs, deepCopy(point));
        continue;
      }
      current.currentAsset += point.currentAsset;
      current.currentAssetFloating += point.currentAssetFloating;
      current.currentBaseAsset += point.currentBaseAsset;
      current.currentSafeHaven += point.currentSafeHaven;
      for (const [label, value] of Object.entries(
        point.currentBaseAssetLabeled,
      )) {
        current.currentBaseAssetLabeled[label] =
          (current.currentBaseAssetLabeled[label] ?? 0) + value;
      }
    }
  }
  first.backtestPack.growthOvertime = [...growthByTime.values()].sort(
    (left, right) => left.timeMs - right.timeMs,
  );
  return first;
}
