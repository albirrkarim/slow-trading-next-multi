import {
  KLINES_FOLDER,
  VOLATILITY_FOLDER,
  makeScopedFolder,
} from "@/components/api/constants";
import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import { detectVolatilityPoints, type VolatilityPoint } from "@/lib/dynamic";
import { getExchange } from "@/lib/exchange";
import { getMarketCapUSDForSymbol } from "@/lib/exchange/market-cap";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import { randomUUID } from "crypto";
import fs from "fs-extra";
import path from "path";
import { summarizeCoinVolatility } from "./result";
import { computeCoinCorrelationScores } from "./correlation";
import { validateFuturesSymbols } from "./validation";
import type {
  CoinFinderChartData,
  CoinFinderJob,
  CoinFinderRange,
  CoinFinderResult,
  CoinFinderVolatilityMap,
} from "./types";

const INTERVAL = "5m" as const;
const EXCHANGE = "binance" as const;
const MARKET_TYPE = "FUTURES" as const;
const jobs = new Map<string, CoinFinderJob>();
const jobControllers = new Map<string, AbortController>();
const JOB_RETENTION_MS = 6 * 60 * 60 * 1000;

function normalizeSymbol(symbol: string): string {
  return symbol
    .trim()
    .toUpperCase()
    .replace(/_?USDT$/, "");
}

function normalizeSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
}

function assertRange(range: string): asserts range is CoinFinderRange {
  if (
    !(
      ["6month", "1year", "2year", "3year", "4year", "5year"] as string[]
    ).includes(range)
  ) {
    throw new Error("Unsupported coin finder range");
  }
}

function assertSymbols(symbols: string[]) {
  if (symbols.length === 0) {
    throw new Error("Enter at least one symbol");
  }

  const invalid = symbols.find((symbol) => !/^[A-Z0-9]{1,20}$/.test(symbol));
  if (invalid) {
    throw new Error(`Invalid symbol: ${invalid}`);
  }
}

function getVPointsPath(range: CoinFinderRange, symbol: string) {
  return path.join(VOLATILITY_FOLDER, EXCHANGE, range, `${symbol}.json`);
}

function getVPointsMetadataPath(range: CoinFinderRange, symbol: string) {
  return path.join(
    VOLATILITY_FOLDER,
    EXCHANGE,
    range,
    ".meta",
    `${symbol}.json`,
  );
}

function getKlinesFolder(range: CoinFinderRange) {
  return makeScopedFolder({
    range,
    interval: INTERVAL,
    baseFolder: `${KLINES_FOLDER}/${EXCHANGE}/${MARKET_TYPE}`,
  });
}

function getKlinesPath(range: CoinFinderRange, symbol: string) {
  return path.join(
    getKlinesFolder(range),
    `${symbol}_USDT_${INTERVAL}_${range}.json`,
  );
}

async function readVPoints(range: CoinFinderRange, symbol: string) {
  return (await fs.readJson(
    getVPointsPath(range, symbol),
  )) as VolatilityPoint[];
}

async function hasCompatibleVPointsCache(
  range: CoinFinderRange,
  symbol: string,
) {
  const pointsPath = getVPointsPath(range, symbol);
  const metadataPath = getVPointsMetadataPath(range, symbol);
  if (
    !(await fs.pathExists(pointsPath)) ||
    !(await fs.pathExists(metadataPath))
  ) {
    return false;
  }

  const metadata = (await fs.readJson(metadataPath)) as {
    interval?: string;
    marketType?: string;
  };
  return metadata.interval === INTERVAL && metadata.marketType === MARKET_TYPE;
}

async function calculateSymbol({
  onProgress,
  range,
  symbol,
  useCachedVPoints,
  signal,
}: {
  onProgress: (percent: number) => void;
  range: CoinFinderRange;
  symbol: string;
  useCachedVPoints: boolean;
  signal: AbortSignal;
}): Promise<CoinFinderResult> {
  signal.throwIfAborted();
  const vPointsPath = getVPointsPath(range, symbol);

  const getMarketCap = async () => {
    try {
      return await getMarketCapUSDForSymbol(symbol, false);
    } catch {
      return null;
    }
  };

  if (useCachedVPoints && (await hasCompatibleVPointsCache(range, symbol))) {
    const points = await readVPoints(range, symbol);
    signal.throwIfAborted();
    const marketCapUSD = await getMarketCap();
    signal.throwIfAborted();
    onProgress(100);
    return summarizeCoinVolatility({
      cached: true,
      marketCapUSD,
      points,
      range,
      symbol,
    });
  }

  const klines = await fetchKlinesFunction({
    exchangeType: EXCHANGE,
    folder: getKlinesFolder(range),
    interval: INTERVAL,
    marketType: MARKET_TYPE,
    onProgress: ({ percent }) => onProgress(percent),
    saveToFile: false,
    signal,
    simpleTime: range,
    symbol: `${symbol}_USDT`,
    useCache: true,
    verbose: true,
  });

  if (klines.length === 0) {
    throw new Error(`No Binance USDT Futures klines found for ${symbol}`);
  }

  const points = detectVolatilityPoints({ klines, symbol });
  await fs.ensureDir(path.dirname(vPointsPath));
  await fs.writeJson(vPointsPath, points);
  const metadataPath = getVPointsMetadataPath(range, symbol);
  await fs.ensureDir(path.dirname(metadataPath));
  await fs.writeJson(metadataPath, {
    interval: INTERVAL,
    marketType: MARKET_TYPE,
  });

  const marketCapUSD = await getMarketCap();
  signal.throwIfAborted();
  onProgress(100);

  return summarizeCoinVolatility({
    cached: false,
    marketCapUSD,
    points,
    range,
    symbol,
  });
}

async function runJob(job: CoinFinderJob, controller: AbortController) {
  job.status = "running";

  const exchange = getExchange(EXCHANGE);
  const validation = await validateFuturesSymbols({
    getKlines: (symbol) =>
      exchange.getKlines({
        interval: INTERVAL,
        limit: 2,
        marketType: MARKET_TYPE,
        symbol: `${symbol}_USDT`,
      }),
    isCancelled: () => controller.signal.aborted,
    onProgress: (completed, symbol) => {
      job.progress.currentSymbol = symbol;
      job.progress.validationCompleted = completed;
    },
    symbols: job.symbols,
  });

  if (controller.signal.aborted) {
    job.completedAt = Date.now();
    job.status = "cancelled";
    jobControllers.delete(job.id);
    return;
  }

  job.errors.push(...validation.invalid);
  job.symbols = validation.valid;
  job.progress.completed = 0;
  job.progress.currentSymbol = null;
  job.progress.currentSymbolPercent = 0;
  job.progress.stage = "processing";
  job.progress.total = validation.valid.length;

  for (const symbol of job.symbols) {
    if (controller.signal.aborted) break;

    job.progress.currentSymbol = symbol;
    job.progress.currentSymbolPercent = 0;

    try {
      const result = await calculateSymbol({
        onProgress: (percent) => {
          job.progress.currentSymbolPercent = percent;
        },
        range: job.range,
        symbol,
        useCachedVPoints: job.useCachedVPoints,
        signal: controller.signal,
      });
      job.results.push(result);
    } catch (error) {
      if (controller.signal.aborted) break;

      job.errors.push({
        message: error instanceof Error ? error.message : "Unknown error",
        symbol,
      });
    }

    job.progress.completed += 1;
  }

  const volatilityMap: Record<string, VolatilityPoint[]> = {};
  for (const result of job.results) {
    volatilityMap[result.symbol] = await readVPoints(
      result.range,
      result.symbol,
    );
  }
  const correlationScores = computeCoinCorrelationScores(volatilityMap);
  for (const result of job.results) {
    result.correlationScore = correlationScores[result.symbol]?.score ?? null;
    result.correlations = correlationScores[result.symbol]?.pairs ?? {};
  }

  job.completedAt = Date.now();
  job.progress.currentSymbol = null;
  job.progress.currentSymbolPercent = controller.signal.aborted ? 0 : 100;
  job.status = controller.signal.aborted ? "cancelled" : "completed";
  jobControllers.delete(job.id);
}

function startJob({
  range: rangeInput,
  symbols: symbolInputs,
  useCachedVPoints,
}: {
  range: string;
  symbols: string[];
  useCachedVPoints: boolean;
}): CoinFinderJob {
  const expiry = Date.now() - JOB_RETENTION_MS;
  for (const [id, existingJob] of jobs) {
    if ((existingJob.completedAt ?? existingJob.createdAt) < expiry) {
      jobs.delete(id);
      jobControllers.delete(id);
    }
  }

  assertRange(rangeInput);
  const symbols = normalizeSymbols(symbolInputs);
  assertSymbols(symbols);

  const job: CoinFinderJob = {
    createdAt: Date.now(),
    errors: [],
    id: randomUUID(),
    progress: {
      completed: 0,
      currentSymbol: null,
      currentSymbolPercent: 0,
      stage: "validating",
      total: symbols.length,
      validationCompleted: 0,
      validationTotal: symbols.length,
    },
    range: rangeInput,
    results: [],
    status: "queued",
    symbols,
    useCachedVPoints,
  };

  jobs.set(job.id, job);
  const controller = new AbortController();
  jobControllers.set(job.id, controller);
  void runJob(job, controller);
  return job;
}

function getJob(id: string): CoinFinderJob | undefined {
  return jobs.get(id);
}

function cancelJob(id: string): CoinFinderJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status === "completed" || job.status === "cancelled") return job;

  jobControllers.get(id)?.abort();
  job.status = "cancelled";
  job.completedAt = Date.now();
  return job;
}

async function getVolatilityMap(
  jobId: string,
): Promise<CoinFinderVolatilityMap | undefined> {
  const job = jobs.get(jobId);
  if (!job) return undefined;

  const volatilityMap: CoinFinderVolatilityMap = {};
  for (const result of job.results) {
    volatilityMap[result.symbol] = await readVPoints(
      result.range,
      result.symbol,
    );
  }
  return volatilityMap;
}

async function getChart({
  range: rangeInput,
  symbol: symbolInput,
}: {
  range: string;
  symbol: string;
}): Promise<CoinFinderChartData> {
  assertRange(rangeInput);
  const symbol = normalizeSymbol(symbolInput);
  assertSymbols([symbol]);

  const points = await readVPoints(rangeInput, symbol);
  const klinesPath = getKlinesPath(rangeInput, symbol);
  let klines: Kline[];

  if (await fs.pathExists(klinesPath)) {
    klines = (await fs.readJson(klinesPath)) as Kline[];
  } else {
    klines = await fetchKlinesFunction({
      exchangeType: EXCHANGE,
      folder: getKlinesFolder(rangeInput),
      interval: INTERVAL,
      marketType: MARKET_TYPE,
      saveToFile: false,
      simpleTime: rangeInput,
      symbol: `${symbol}_USDT`,
      useCache: true,
      verbose: true,
    });
  }

  const chartKlines: CoinFinderChartData["klines"] = klines.map((kline) => [
    kline[0],
    kline[1],
    kline[2],
    kline[3],
    kline[4],
    kline[5],
  ]);

  return { klines: chartKlines, points, range: rangeInput, symbol };
}

const coinFinder = {
  chart: {
    get: getChart,
  },
  jobs: {
    cancel: cancelJob,
    get: getJob,
    start: startJob,
  },
  volatility: {
    get: getVolatilityMap,
  },
};

export default coinFinder;
export type * from "./types";
