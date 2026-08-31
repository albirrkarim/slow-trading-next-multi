import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import {
  createPredictorMemory,
  detectVolatilityPoints,
  predictor,
  type VolatilityPoint,
} from "@/lib/dynamic";
import type { UnifiedKline } from "@/lib/exchange/types";
import { resolvePersistentStorageRoot } from "@/lib/persistent-storage-root";
import slowQuickBacktest from "@/lib/slowTrading/quick-backtest";
import blackSwan from "@/lib/trading/black-swan";
import fs from "fs-extra";
import path from "path";
import type {
  BlackSwanBacktestInput,
  BlackSwanBacktestPoint,
  BlackSwanBacktestResult,
  BlackSwanSavingsBacktestInput,
  BlackSwanSavingsKline,
  BlackSwanSavingsBacktestResult,
} from "./types";
import blackSwanPortfolioReplay from "./portfolio";

const MINUTE_MS = 60_000;
const WARMUP_MS = 65 * MINUTE_MS;
const MAX_RANGE_MS = 7 * 24 * 60 * MINUTE_MS;
const VPOINT_CONTEXT_MS = 30 * 24 * 60 * MINUTE_MS;
const MAX_SYMBOLS = 30;
const MAX_PREVIEW_POSITIONS = 20;
const MAX_CHART_POINTS = 1_200;
const CACHE_ROOT = path.join(
  resolvePersistentStorageRoot(),
  "slow/cache/black-swan-klines/binance/futures",
);

function normalizeSymbols(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return ["BTC"];
  }
  const symbols = Array.from(
    new Set(
      values
        .map((value) =>
          String(value ?? "")
            .trim()
            .toUpperCase()
            .replace(/_USDT$/, ""),
        )
        .filter(Boolean),
    ),
  );
  return ["BTC", ...symbols.filter((symbol) => symbol !== "BTC")].slice(
    0,
    MAX_SYMBOLS,
  );
}

function normalizePositionSymbols(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) =>
          String(value ?? "")
            .trim()
            .toUpperCase()
            .replace(/_USDT$/, ""),
        )
        .filter(Boolean),
    ),
  ).slice(0, MAX_SYMBOLS - 1);
}

function validateInput(input: BlackSwanBacktestInput) {
  if (!Number.isFinite(input.startTime) || !Number.isFinite(input.endTime)) {
    throw new Error("A valid start and end time are required.");
  }
  if (input.startTime >= input.endTime) {
    throw new Error("The start time must be before the end time.");
  }
  if (input.endTime - input.startTime > MAX_RANGE_MS) {
    throw new Error("Black Swan backtests are limited to 7 days per run.");
  }
}

function cachePath(
  symbol: string,
  interval: "1m" | "5m",
  startTime: number,
  endTime: number,
): string {
  return path.join(
    CACHE_ROOT,
    interval,
    `${symbol}_${startTime}_${endTime}.json`,
  );
}

/** Loads raw Binance futures candles with a compact, range-specific cache. */
async function loadCandles(params: {
  endTime: number;
  interval: "1m" | "5m";
  signal?: AbortSignal;
  startTime: number;
  symbol: string;
  useCache: boolean;
}): Promise<UnifiedKline[]> {
  params.signal?.throwIfAborted();
  const file = cachePath(
    params.symbol,
    params.interval,
    params.startTime,
    params.endTime,
  );
  if (params.useCache && (await fs.pathExists(file))) {
    const cached = (await fs.readJson(file)) as UnifiedKline[];
    params.signal?.throwIfAborted();
    return cached;
  }

  const candles = await fetchKlinesFunction({
    endTime: params.endTime,
    exchangeType: "binance",
    exchangeTypeForce: true,
    interval: params.interval,
    marketType: "FUTURES",
    saveToFile: false,
    signal: params.signal,
    startTime: params.startTime,
    symbol: `${params.symbol}_USDT`,
    useCache: false,
    verbose: false,
  });
  params.signal?.throwIfAborted();
  if (params.useCache) {
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, JSON.stringify(candles));
  }
  return candles;
}

async function loadCandleMap(params: {
  endTime: number;
  interval: "1m" | "5m";
  signal?: AbortSignal;
  startTime: number;
  symbols: string[];
  useCache: boolean;
}): Promise<Record<string, UnifiedKline[]>> {
  params.signal?.throwIfAborted();
  const output: Record<string, UnifiedKline[]> = {};
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, params.symbols.length) }, async () => {
      while (cursor < params.symbols.length) {
        params.signal?.throwIfAborted();
        const symbol = params.symbols[cursor++];
        output[symbol] = await loadCandles({ ...params, symbol });
      }
    }),
  );
  return output;
}

/** Converts raw 1m candles into the numeric OHLC shape used by the browser. */
function buildDisplayKlines(params: {
  candles: UnifiedKline[];
  endTime: number;
  startTime: number;
}): BlackSwanSavingsKline[] {
  const visible = params.candles.filter(
    (candle) =>
      Number(candle[6]) >= params.startTime &&
      Number(candle[0]) <= params.endTime,
  );
  return visible.map((candle) => [
    Number(candle[0]),
    Number(candle[1]),
    Number(candle[2]),
    Number(candle[3]),
    Number(candle[4]),
  ]);
}

/** Finds the first candle whose open time is not before the requested time. */
function lowerBoundOpenTime(
  candles: UnifiedKline[],
  targetTimeMs: number,
): number {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Number(candles[middle][0]) < targetTimeMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Finds the first candle whose close time is after the requested time. */
function upperBoundCloseTime(
  candles: UnifiedKline[],
  targetTimeMs: number,
): number {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Number(candles[middle][6]) <= targetTimeMs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Selects the closed warm-up window without rescanning the full incident range. */
function sliceClosedWindow(
  candles: UnifiedKline[],
  currentTimeMs: number,
): UnifiedKline[] {
  const start = currentTimeMs - WARMUP_MS;
  const startIndex = lowerBoundOpenTime(candles, start);
  const endIndex = upperBoundCloseTime(candles, currentTimeMs);
  return candles.slice(startIndex, endIndex);
}

/** Keeps chart payloads bounded while retaining endpoints and state transitions. */
function downsampleChartPoints<TPoint extends BlackSwanBacktestPoint>(
  points: TPoint[],
  transitions: BlackSwanBacktestResult["transitions"],
): TPoint[] {
  if (points.length <= MAX_CHART_POINTS) {
    return points;
  }

  const transitionTimes = new Set(
    transitions.map((transition) => transition.t),
  );
  const selected = points.filter((point, index) => {
    const isEndpoint = index === 0 || index === points.length - 1;
    const isTransition = transitionTimes.has(point.t);
    const isIntervalSample =
      index % Math.ceil(points.length / MAX_CHART_POINTS) === 0;
    return isEndpoint || isTransition || isIntervalSample;
  });
  if (selected.length <= MAX_CHART_POINTS) {
    return selected;
  }

  const stride = (selected.length - 1) / (MAX_CHART_POINTS - 1);
  return Array.from(
    { length: MAX_CHART_POINTS },
    (_, index) => selected[Math.round(index * stride)],
  );
}

function replayDetector(params: {
  candleMap: Record<string, UnifiedKline[]>;
  forceEnabled: boolean;
  input: BlackSwanBacktestInput;
  symbols: string[];
}): BlackSwanBacktestResult {
  const { candleMap, forceEnabled, input, symbols } = params;
  const config = {
    ...blackSwan.config.normalize(input.config),
    enabled: forceEnabled || blackSwan.config.normalize(input.config).enabled,
    requireManualLiveRecovery: false,
  };
  const btcCandles = candleMap.BTC ?? [];
  const evaluationCandles = btcCandles.filter(
    (candle) =>
      Number(candle[6]) >= input.startTime &&
      Number(candle[6]) <= input.endTime,
  );
  let state = blackSwan.state.create(input.startTime);
  const points: BlackSwanBacktestPoint[] = [];
  const transitions: BlackSwanBacktestResult["transitions"] = [];

  for (let index = 0; index < evaluationCandles.length; index += 1) {
    if (index % 100 === 0) input.signal?.throwIfAborted();
    const candle = evaluationCandles[index];
    const currentTimeMs = Number(candle[6]);
    const btcWindow = sliceClosedWindow(btcCandles, currentTimeMs);
    const first = blackSwan.detector.evaluate({
      config,
      previous: state,
      currentTimeMs,
      btcCandles: btcWindow,
      mode: "sandbox",
    });
    let breadthCandlesBySymbol: Record<string, UnifiedKline[]> | undefined;
    if (first.reason === "BTC_WARNING") {
      breadthCandlesBySymbol = Object.fromEntries(
        symbols
          .filter((symbol) => symbol !== "BTC")
          .map((symbol) => [
            symbol,
            sliceClosedWindow(candleMap[symbol] ?? [], currentTimeMs),
          ]),
      );
    }
    const next = blackSwan.detector.evaluate({
      config,
      previous: state,
      currentTimeMs,
      btcCandles: btcWindow,
      breadthCandlesBySymbol,
      mode: "sandbox",
    });
    const point: BlackSwanBacktestPoint = {
      t: currentTimeMs,
      price: Number(candle[4]),
      btc5Pct: next.evidence?.btc[5]?.pct,
      btc15Pct: next.evidence?.btc[15]?.pct,
      btc60Pct: next.evidence?.btc[60]?.pct,
      breadthPct: next.evidence?.breadth?.pct,
      breadthValid: next.evidence?.breadth?.valid,
      status: next.status,
      reason: next.reason,
    };
    points.push(point);
    if (next.status !== state.status) {
      transitions.push({
        t: currentTimeMs,
        from: state.status,
        to: next.status,
        reason: next.reason,
        btc5Pct: point.btc5Pct,
        btc15Pct: point.btc15Pct,
        btc60Pct: point.btc60Pct,
        breadthPct: point.breadthPct,
        breadthAffected: next.evidence?.breadth?.affected,
        breadthValid: point.breadthValid,
      });
    }
    state = next;
  }

  const summary = {
    candleCount: points.length,
    crisisMinutes: points.filter((point) => point.status === "CRISIS").length,
    dataStaleMinutes: points.filter((point) => point.reason === "DATA_STALE")
      .length,
    maxBreadthPct: Math.max(0, ...points.map((point) => point.breadthPct ?? 0)),
    maxDrawdownPct: Math.min(0, ...points.map((point) => point.btc60Pct ?? 0)),
    protectiveMinutes: points.filter((point) => point.status !== "NORMAL")
      .length,
    watchMinutes: points.filter((point) => point.status === "WATCH").length,
  };

  return {
    config,
    symbols,
    startTime: input.startTime,
    endTime: input.endTime,
    points,
    transitions,
    summary,
  };
}

/** Replays the detector minute-by-minute from raw closed candles with no lookahead. */
async function run(
  input: BlackSwanBacktestInput,
): Promise<BlackSwanBacktestResult> {
  validateInput(input);
  const symbols = normalizeSymbols(input.symbols);
  const candleMap = await loadCandleMap({
    endTime: input.endTime,
    interval: "1m",
    signal: input.signal,
    startTime: input.startTime - WARMUP_MS,
    symbols,
    useCache: input.useCache !== false,
  });
  const result = replayDetector({
    candleMap,
    forceEnabled: true,
    input,
    symbols,
  });
  return {
    ...result,
    points: downsampleChartPoints(result.points, result.transitions),
  };
}

/** Finds the incident's worst BTC 5m drawdown independently of draft policy. */
function findIncidentTime(params: {
  btcCandles: UnifiedKline[];
  endTime: number;
  signal?: AbortSignal;
  startTime: number;
}): number {
  let incidentT = params.startTime;
  let worstPct = 0;
  for (let index = 0; index < params.btcCandles.length; index += 1) {
    if (index % 100 === 0) params.signal?.throwIfAborted();
    const candle = params.btcCandles[index];
    const currentTimeMs = Number(candle[6]);
    if (currentTimeMs < params.startTime || currentTimeMs > params.endTime) {
      continue;
    }
    const evidence = blackSwan.detector.calculateDrawdown({
      candles: params.btcCandles,
      currentTimeMs,
      windowMinutes: 5,
    });
    if (evidence && evidence.pct < worstPct) {
      incidentT = currentTimeMs;
      worstPct = evidence.pct;
    }
  }
  return incidentT;
}

/** Generates the standard 5m volatility arrays without altering the generator. */
interface GeneratedVPoints {
  confirmationTBySymbol: Record<string, Record<string, number>>;
  volatilityMap: Record<string, VolatilityPoint[]>;
}

/**
 * Replays the unchanged detector once to record when each pivot became visible.
 * The vPoint itself keeps its original pivot timestamp and price.
 */
function buildVPointConfirmationTimes(params: {
  candles: UnifiedKline[];
  signal?: AbortSignal;
  symbol: string;
}): Record<string, number> {
  if (params.candles.length === 0) return {};
  const first = params.candles[0];
  let memory = createPredictorMemory(Number(first[4]), Number(first[0]));
  const confirmationTimes: Record<string, number> = {};

  for (let index = 1; index < params.candles.length; index += 1) {
    if (index % 100 === 0) params.signal?.throwIfAborted();
    const candle = params.candles[index];
    const result = predictor(candle, memory, params.symbol);
    memory = result.memory;
    if (result.point) {
      confirmationTimes[result.point.id] = Number(candle[6]);
    }
  }

  return confirmationTimes;
}

function generateVPointMap(params: {
  candleMap: Record<string, UnifiedKline[]>;
  signal?: AbortSignal;
  symbols: string[];
}): GeneratedVPoints {
  const volatilityMap: Record<string, VolatilityPoint[]> = {};
  const confirmationTBySymbol: Record<string, Record<string, number>> = {};
  for (const symbol of params.symbols) {
    params.signal?.throwIfAborted();
    const candles = params.candleMap[symbol] ?? [];
    volatilityMap[symbol] = detectVolatilityPoints({ klines: candles, symbol });
    confirmationTBySymbol[symbol] = buildVPointConfirmationTimes({
      candles,
      signal: params.signal,
      symbol,
    });
  }
  return { confirmationTBySymbol, volatilityMap };
}

/** Replays real vPoint entries with protection off and with the draft policy. */
async function runSavings(
  input: BlackSwanSavingsBacktestInput,
): Promise<BlackSwanSavingsBacktestResult> {
  validateInput(input);
  input.signal?.throwIfAborted();
  if (
    !Number.isFinite(input.startingBalanceUSDT) ||
    input.startingBalanceUSDT <= 0
  ) {
    throw new Error("A positive backtest balance is required.");
  }

  const positionSymbols = normalizePositionSymbols(input.tradingConfig.symbols);
  if (positionSymbols.length === 0) {
    throw new Error("At least one configured symbol is required.");
  }
  const symbols = normalizeSymbols(positionSymbols);
  const incidentCandleMap = await loadCandleMap({
    endTime: input.endTime,
    interval: "1m",
    signal: input.signal,
    startTime: input.startTime - WARMUP_MS,
    symbols,
    useCache: input.useCache !== false,
  });
  const detectorResult = replayDetector({
    candleMap: incidentCandleMap,
    forceEnabled: false,
    input,
    symbols,
  });
  const incidentT = findIncidentTime({
    btcCandles: incidentCandleMap.BTC ?? [],
    endTime: input.endTime,
    signal: input.signal,
    startTime: input.startTime,
  });
  const vPointGenerationStartT = incidentT - VPOINT_CONTEXT_MS;
  const vPointGenerationEndT = incidentT + VPOINT_CONTEXT_MS;
  const fiveMinuteCandleMap = await loadCandleMap({
    endTime: vPointGenerationEndT,
    interval: "5m",
    signal: input.signal,
    startTime: vPointGenerationStartT,
    symbols,
    useCache: input.useCache !== false,
  });
  const generatedVPoints = generateVPointMap({
    candleMap: fiveMinuteCandleMap,
    signal: input.signal,
    symbols,
  });
  const { confirmationTBySymbol, volatilityMap } = generatedVPoints;
  const backtest = await slowQuickBacktest.run({
    config: {
      ...input.tradingConfig,
      symbols: positionSymbols,
    },
    endTime: vPointGenerationEndT,
    range: "custom",
    signal: input.signal,
    startAmount: input.startingBalanceUSDT,
    startTime: vPointGenerationStartT,
    volatilityMap,
  });
  const crisisT = detectorResult.transitions.find(
    (transition) => transition.to === "CRISIS",
  )?.t;
  const positionSnapshotT = crisisT ?? incidentT;
  const entryAbsoluteLevel = Math.max(
    1,
    Math.floor(input.tradingConfig.minActionableAbsoluteLevel ?? 2),
  );
  const positions = Array.from(
    backtest.tradeHistory
      .filter(
        (position) =>
          Math.abs(position.opened.vPoint.lvl) === entryAbsoluteLevel &&
          (confirmationTBySymbol[position.symbol]?.[
            position.opened.vPoint.id
          ] ?? position.opened.t) <= positionSnapshotT,
      )
      .sort((left, right) => right.opened.t - left.opened.t)
      .reduce((latestBySymbol, position) => {
        if (!latestBySymbol.has(position.symbol)) {
          latestBySymbol.set(position.symbol, position);
        }
        return latestBySymbol;
      }, new Map<string, (typeof backtest.tradeHistory)[number]>())
      .values(),
  )
    .sort((left, right) => left.opened.t - right.opened.t)
    .slice(0, MAX_PREVIEW_POSITIONS);
  const replayCandleEntries = await Promise.all(
    positions.map(async (position) => {
      const candles = await loadCandles({
        endTime: input.endTime,
        interval: "1m",
        signal: input.signal,
        startTime: Math.min(input.startTime - WARMUP_MS, position.opened.t),
        symbol: position.symbol,
        useCache: input.useCache !== false,
      });
      return [position.symbol, candles] as const;
    }),
  );
  const simulationCandleMap = {
    ...incidentCandleMap,
    ...Object.fromEntries(replayCandleEntries),
  };
  const replayInput = {
    candleMap: simulationCandleMap,
    config: detectorResult.config,
    confirmationTBySymbol,
    detectorResult,
    incidentT,
    monitoringConfig: input.monitoringConfig,
    oneSideFeeRatio: input.oneSideFeeRatio,
    positions,
    replayEndT: input.endTime,
    signal: input.signal,
    startingBalanceUsdt: input.startingBalanceUSDT,
    tradingConfig: input.tradingConfig,
    tradingMode: input.tradingConfig.tradingMode,
    volatilityMap,
    vPointGenerationEndT,
    vPointGenerationStartT,
  } as const;
  const seedResult = blackSwanPortfolioReplay.simulate(replayInput);
  input.signal?.throwIfAborted();

  const displayWindows = new Map<string, { startTime: number; endTime: number }>();
  displayWindows.set("BTC", {
    endTime: input.endTime,
    startTime: input.startTime,
  });
  for (const position of seedResult.positions) {
    const existing = displayWindows.get(position.symbol);
    displayWindows.set(position.symbol, {
      endTime: Math.max(existing?.endTime ?? 0, position.displayEndT),
      startTime: Math.min(
        existing?.startTime ?? Number.POSITIVE_INFINITY,
        position.displayStartT,
      ),
    });
  }
  const displayCandleEntries = await Promise.all(
    Array.from(displayWindows.entries()).map(async ([symbol, window]) => {
      const candles = await loadCandles({
        ...window,
        interval: "1m",
        signal: input.signal,
        symbol,
        useCache: input.useCache !== false,
      });
      return [symbol, candles] as const;
    }),
  );
  const finalReplayCandleMap = {
    ...replayInput.candleMap,
    ...Object.fromEntries(displayCandleEntries),
  };
  const result = blackSwanPortfolioReplay.simulate({
    ...replayInput,
    candleMap: finalReplayCandleMap,
  });
  input.signal?.throwIfAborted();
  const finalDisplayWindows = new Map<
    string,
    { startTime: number; endTime: number }
  >();
  finalDisplayWindows.set("BTC", {
    endTime: input.endTime,
    startTime: input.startTime,
  });
  for (const position of result.positions) {
    const existing = finalDisplayWindows.get(position.symbol);
    finalDisplayWindows.set(position.symbol, {
      endTime: Math.max(existing?.endTime ?? 0, position.displayEndT),
      startTime: Math.min(
        existing?.startTime ?? Number.POSITIVE_INFINITY,
        position.displayStartT,
      ),
    });
  }
  const klinesBySymbol = Object.fromEntries(
    Array.from(finalDisplayWindows.entries()).map(([symbol, window]) => [
      symbol,
      buildDisplayKlines({
        candles: finalReplayCandleMap[symbol] ?? [],
        ...window,
      }),
    ]),
  );

  return {
    ...result,
    klinesBySymbol,
    points: downsampleChartPoints(result.points, result.transitions),
  };
}

const blackSwanBacktest = {
  run,
  savings: {
    run: runSavings,
  },
} as const;

export default blackSwanBacktest;
export type * from "./types";
