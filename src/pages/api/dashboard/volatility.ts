import { FILES } from "@/components/storage";
import {
  type PredictionEngineMemory,
  type VolatilityPoint,
  predictionEngine,
} from "@/lib/dynamic";
import { DEFAULT_EXCHANGE } from "@/lib/exchange/constants";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import slowTrading from "@/lib/slowTrading";
import { tradeLog } from "@/lib/trading";
import fs from "fs-extra";
import md5 from "md5";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DASHBOARD_VOLATILITY_CACHE_MS = 10 * MINUTE_MS;

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
    await keepTheVolatilityUpdated(req, res);
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

function pickTimeParam(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickStringParam(value: unknown): string | undefined {
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

function bucketTime(value: number | undefined, bucketMs: number) {
  return value === undefined ? undefined : Math.floor(value / bucketMs);
}

/** Returns the ten-minute bucket used to refresh dashboard volatility data. */
export function getDashboardVolatilityCacheBucket(nowMs: number) {
  return Math.floor(nowMs / DASHBOARD_VOLATILITY_CACHE_MS);
}

/**
 * Builds a stable cache window for dashboard volatility responses.
 *
 * Named dashboard ranges use a daily bucket because their timestamps are
 * generated from Date.now(). Custom ranges keep minute-level precision because
 * they come from datetime-local inputs.
 */
export function buildDashboardVolatilityCacheWindow({
  endTimeMs,
  range,
  startTimeMs,
}: {
  endTimeMs?: number;
  range?: string;
  startTimeMs?: number;
}) {
  const normalizedRange = String(range ?? "").trim();

  if (normalizedRange && normalizedRange !== "custom") {
    return {
      endDay: bucketTime(endTimeMs, DAY_MS),
      range: normalizedRange,
    };
  }

  return {
    endMinute: bucketTime(endTimeMs, MINUTE_MS),
    range: normalizedRange || "custom",
    startMinute: bucketTime(startTimeMs, MINUTE_MS),
  };
}

/** Keeps only entry-signal markers visible in the selected dashboard window. */
export function filterDashboardEntrySignalResponse({
  endTimeMs,
  entrySignals,
  startTimeMs,
}: {
  endTimeMs?: number;
  entrySignals: VolatilityPoint[];
  startTimeMs?: number;
}) {
  if (startTimeMs === undefined && endTimeMs === undefined) {
    return entrySignals;
  }

  return entrySignals.filter(
    (point) =>
      (startTimeMs === undefined || point.t >= startTimeMs) &&
      (endTimeMs === undefined || point.t <= endTimeMs),
  );
}

async function keepTheVolatilityUpdated(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const params = req.method == "GET" ? req.query : req.body;
  const requestedExchangeType = pickExchangeParam(params.exchangeType);
  const slowStorage = await slowTrading.storage.data.load({
    modeScope: "active",
  });
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
    forceUpdate = false,
    removeUsed = false,
  } = params;

  const logSession = tradeLog.startSession({
    categories: logCategories,
    verbose: Boolean(verbose),
  });

  const startTimeMs = pickTimeParam(params.startTime);
  const endTimeMs = pickTimeParam(params.endTime);
  const range = pickStringParam(params.range);

  const cachePath = `${FILES.slow.getCachePrefix("volatility")}${md5(
    JSON.stringify({
      cacheBucket: getDashboardVolatilityCacheBucket(Date.now()),
      config: slowStorage.config,
      exchangeType,
      range: buildDashboardVolatilityCacheWindow({
        endTimeMs,
        range,
        startTimeMs,
      }),
      symbols,
    }),
  )}.json`;

  await fs.ensureDir(path.dirname(cachePath));

  if (
    (await fs.exists(cachePath)) &&
    forceUpdate == false &&
    removeUsed == false
  ) {
    const output = await fs.readJson(cachePath);
    res.json(output);
    return;
  }

  try {
    const volatilityMap: Record<string, VolatilityPoint[]> = {};

    // const files = await fs.readdir(FILES.slow.volatility(exchangeType));

    // tradeLog.log("files ", files);

    tradeLog.log("tradeLog categories", tradeLog.categories);

    for (const symbol of symbols) {
      // A. Load existing volatility from file if exists
      if (
        (await fs.exists(
          `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
        )) &&
        !forceUpdate
      ) {
        tradeLog.debug("Load volatility from json ", symbol);
        const data = (await fs.readJSON(
          `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
        )) as PredictionEngineMemory;

        volatilityMap[symbol] = data.lastVolatility;
      } else {
        // B. Otherwise, generate new volatility data
        tradeLog.debug("get new the volatility ", symbol);

        const vMemory = {
          symbol,
          lastVolatility: [],
        };

        await predictionEngine({
          tradePair: `${symbol}_USDT`,
          memory: vMemory,
          endTime: Date.now(),
          exchangeType,
          marketType,
          minActionableAbsoluteLevel:
            slowStorage.config.minActionableAbsoluteLevel,
        });

        await fs.writeJson(
          `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
          vMemory,
        );

        volatilityMap[symbol] = vMemory.lastVolatility;
      }

      // C. Optionally remove used volatility points
      if (removeUsed) {
        tradeLog.debug("Remove used vpoint ", symbol);

        for (const item of volatilityMap[symbol]) {
          delete item.used;
        }

        const vMemory: PredictionEngineMemory = {
          symbol,
          lastVolatility: volatilityMap[symbol],
        };

        // save back
        await fs.writeJson(
          `${FILES.slow.volatility(exchangeType)}/${symbol}.json`,
          vMemory,
        );
      }
    }

    const responseVolatilityMap = slowTrading.entrySequences.range.crop({
      endTimeMs,
      startTimeMs,
      volatilityMap,
    });

    // OPTIMIZED FOR LOT OF COINS SO BETTER TO NOT SHOW
    // D. Get historical entry signal for the bounded dashboard response.
    // const getRecommendations =
    //   GET_RECOMMENDATIONS_MAP[
    //     slowStorage.config.decisionEngineVersion ?? "decision.v14"
    //   ] ?? getRecommendationsProduction;

    // const historicalEntrySignal = await getHistoricalEntrySignal({
    //   volatilityMap: responseVolatilityMap,
    //   getRecommendations,
    //   exchangeType,
    // });

    // const responseEntrySignals = filterDashboardEntrySignalResponse({
    //   endTimeMs,
    //   entrySignals: historicalEntrySignal,
    //   startTimeMs,
    // });

    // convert into series
    // const leveledMarkers = convertVolatilityToLeveledMarkers(
    //   "SIGNAL",
    //   responseEntrySignals,
    // );

    const output = {
      status: true,
      data: responseVolatilityMap,
      series: [],
    };

    await fs.writeJson(cachePath, output);

    res.json(output);
  } catch (err) {
    tradeLog.error(err);
    res.status(500).json({
      status: false,
      data: {},
      series: [],
    });
  } finally {
    tradeLog.endSession(logSession);
  }
}
