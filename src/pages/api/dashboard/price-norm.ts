import { COLORS_BG, DEFAULT_COLORS } from "@/components/client/constants";
import { applyTimeWindowClient } from "@/components/LiveDashboard/utils";
import { FILES } from "@/components/storage";
import { fetchKlinesFunction } from "@/lib/datasets";
import type {
  DynamicTradeMemory,
  PredictionEngineMemory,
  PriceNorm,
  VolatilityPoint,
} from "@/lib/dynamic";
import {
  DEFAULT_DYNAMIC_TRADING_MEMORY,
  generateInitialPriceNorm,
} from "@/lib/dynamic";
import { getSharpDownRatio } from "@lib/brain/algorithms/v4/decisions/v12/feature/utils";

import { deepCopy } from "@/components/client/utils";
import { type LeveledMarkers } from "@/components/LiveDashboard/converter";
import { windowsMs } from "@/lib/dynamic/utils/nn/data/features/constants";
import { DEFAULT_LOG_CATEGORIES, tradeLog } from "@/lib/trading";
import fs from "fs-extra";
import type { NextApiRequest, NextApiResponse } from "next";
import { DEFAULT_EXCHANGE } from "@/lib/exchange/constants";
import slowTrading from "@/lib/slowTrading";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // 🧩 Set CORS headers (allow all origins)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // ⚡ Handle preflight OPTIONS requests
  if (req.method === "OPTIONS") {
    res.status(204).end(); // no content
    return;
  }

  if (req.method === "GET" || req.method === "POST") {
    await getPriceNorm(req, res);
  } else {
    res.setHeader("Allow", ["GET", "POST", "DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

function pickExchangeParam(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const first = value.find(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
    return typeof first === "string" ? first.trim() : undefined;
  }

  return undefined;
}

async function getPriceNorm(req: NextApiRequest, res: NextApiResponse) {
  const params = req.method == "GET" ? req.query : req.body;
  const requestedExchangeType = pickExchangeParam(params.exchangeType);
  const slowStorage = await slowTrading.storage.data.load();
  const exchangeType =
    requestedExchangeType ??
    slowStorage.config.exchangeType ??
    DEFAULT_EXCHANGE;
  const marketType = resolveMarketTypeForTradingMode(
    slowStorage.config.tradingMode,
  );
  const {
    verbose = false,
    logCategories,
    symbols = [],
    startTime,
    endTime,
    forceUpdate = false,
  } = params;

  const logSession = tradeLog.startSession({
    categories: logCategories,
    verbose: Boolean(verbose),
  });

  try {
    // A. Force update the price norm map over time
    if (forceUpdate) {
      tradeLog.setVerbose(true);
      tradeLog.setCategories([...DEFAULT_LOG_CATEGORIES, "debug"]);

      tradeLog.debug("forceUpdate dynamicTradeMemory.priceNormMapOverTime");

      let currentTimeMs = Date.now();
      const firstSymbol = symbols[0] ?? "BTC";
      const klines = await fetchKlinesFunction({
        symbol: firstSymbol + "_USDT",
        interval: "5m",
        simpleTime: "10minute",
        exchangeType,
        marketType,
      });

      const currentKline = klines.at(-1);
      if (currentKline) {
        currentTimeMs = currentKline[0];
      }

      const dynamicTradeMemory: DynamicTradeMemory = deepCopy(
        DEFAULT_DYNAMIC_TRADING_MEMORY,
      );

      const volatilityMap: Record<string, VolatilityPoint[]> = {};

      for (const symbol of symbols) {
        const data = (await fs.readJSON(
          `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
        )) as PredictionEngineMemory;

        volatilityMap[symbol] = data.lastVolatility;
      }

      await generateInitialPriceNorm({
        currentTimeMs,
        symbols,
        startTime: currentTimeMs,
        dynamicTradeMemory,
        useCache: false,
        saveToFile: true,
        exchangeType,
        volatilityMap,
      });

      tradeLog.debug("dynamicTradeMemory.priceNormMapOverTime ready!");
    }

    // B. Load the price norm map over time
    const priceNormMap: Record<string, PriceNorm[]> = {};

    if (await fs.exists(FILES.slow.priceNormMapOverTime(exchangeType))) {
      const full = await fs.readJSON(
        FILES.slow.priceNormMapOverTime(exchangeType),
      );

      // filter
      for (const symbol of symbols) {
        priceNormMap[symbol] = full[symbol] ?? [];
      }
    } else {
      tradeLog.error(
        "No json of ",
        FILES.slow.priceNormMapOverTime(exchangeType),
      );
    }

    const series: LeveledMarkers[][] = [];
    const names: string[] = [];

    // C. Calculate down ratio over time
    const last15Day = windowsMs["1m"] / 2;
    let idx = 0;

    for (const symbol of Object.keys(priceNormMap)) {
      const priceNorm = priceNormMap[symbol];

      const originColor = DEFAULT_COLORS[idx % DEFAULT_COLORS.length];

      const leveled: LeveledMarkers[] = priceNorm.map((e) => ({
        time: Math.floor(e.t / 1000),
        level: e.c,
        color: originColor,
      }));

      series.push(leveled);
      names.push(symbol);

      const downRatioOverTime: LeveledMarkers[] = [];

      const backColor = COLORS_BG[idx % COLORS_BG.length];

      for (const item of priceNorm) {
        const cutOff = item.t - last15Day;
        const recent = priceNorm.filter((e) => e.t > cutOff && e.t <= item.t);

        const downRatio = getSharpDownRatio(recent);

        downRatioOverTime.push({
          time: Math.floor(item.t / 1000),
          level: downRatio,
          color: backColor,
        });
      }

      series.push(downRatioOverTime);
      names.push(symbol + "_DOWN_RATIO");

      idx++;
    }

    if (startTime && endTime) {
      // UTC
      applyTimeWindowClient(series, startTime / 1000, endTime / 1000);
    }

    res.json({
      status: true,
      data: {
        series,
        names,
      },
    });
  } finally {
    tradeLog.endSession(logSession);
  }
}
