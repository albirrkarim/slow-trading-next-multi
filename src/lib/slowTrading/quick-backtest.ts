import type { LeveledMarkers } from "@/components/LiveDashboard/converter";
import { PRODUCTION_DECISION_ENGINE } from "@/components/constants";
import { DECISION_ENGINE_MAP } from "@/lib/brain/algorithms/v4/decisions";
import type { BacktestConfigDynamic, VolatilityPoint } from "@/lib/dynamic";
import { formatDuration as formatExactDuration } from "@/lib/dynamic/client";
import type { Position } from "@/lib/trading/models";
import tradingPosition from "@/lib/trading/position";
import type { SlowTradingHistoryPosition } from "./types";

import { runBacktestVolatilityDynamic } from "../dynamic/backtest-volatility";
import type { GrowthOvertimeDetail } from "../dynamic/backtest-volatility/type";
import type { DynamicTradeConfig } from "../dynamic/type-dynamic";
import { windowsMs } from "../dynamic/constants-time";
import {
  DEFAULT_EXCHANGE_ACCOUNT_SLUG,
  runWithExchangeAccount,
} from "@/lib/exchange/account-context";

const QUICK_BACKTEST_ENTRY_CUTOFF_BUFFER_MS = windowsMs["3d"];

export interface SlowQuickBacktestInput {
  volatilityMap: Record<string, VolatilityPoint[]>;
  config: DynamicTradeConfig;
  startAmount?: number;
  startTime?: number;
  endTime?: number;
  range?: string;
  signal?: AbortSignal;
  volume24hBySymbol?: Record<string, number>;
  verbose?: boolean;
  /** Enabled account strategies and their independent starting balances. */
  accounts?: Array<{
    slug: string;
    name?: string;
    enabled: boolean;
    config: DynamicTradeConfig;
    startAmount: number;
  }>;
}

export interface SlowQuickBacktestMetrics {
  entryCount: number;
  sharpeRatio: number;
  gainPct: number;
  gainUsdt: number;
  finalUsdt: number;
  avgProfitUsdtPerWeek: number;
  maxPositionDrawdownPct: number;
  minHoldDurationMs: number;
  totalHoldDurationMs: number;
  avgHoldDurationMs: number;
  maxHoldDurationMs: number;
  minHoldDuration: string;
  totalHoldDuration: string;
  avgHoldDuration: string;
  maxHoldDuration: string;
  minActiveCapitalDurationMs: number;
  totalActiveCapitalDurationMs: number;
  avgActiveCapitalDurationMs: number;
  maxActiveCapitalDurationMs: number;
  minActiveCapitalDuration: string;
  totalActiveCapitalDuration: string;
  avgActiveCapitalDuration: string;
  maxActiveCapitalDuration: string;
  minUnusedCapitalDurationMs: number;
  totalUnusedCapitalDurationMs: number;
  avgUnusedCapitalDurationMs: number;
  maxUnusedCapitalDurationMs: number;
  minUnusedCapitalDuration: string;
  totalUnusedCapitalDuration: string;
  avgUnusedCapitalDuration: string;
  maxUnusedCapitalDuration: string;
}

export interface SlowQuickBacktestResult {
  metrics: SlowQuickBacktestMetrics;
  tradeHistory: SlowTradingHistoryPosition[];
  growthOvertimeSeries: {
    names: string[];
    series: LeveledMarkers[][];
  };
  simulationSeries: {
    names: string[];
    series: LeveledMarkers[][];
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getPortfolioValue(point: GrowthOvertimeDetail | undefined) {
  if (!point) return 0;
  return point.currentAsset + point.currentSafeHaven;
}

/**
 * Calculates risk-adjusted return from every Quick Backtest equity snapshot.
 * The generic leaderboard Sharpe is monthly, which returns 0 for short visible
 * dashboard ranges; this one is event-return based for `/slow` quick reports.
 */
export function calculateQuickSharpeRatio(
  growthOvertime: GrowthOvertimeDetail[],
) {
  const values = growthOvertime
    .map((point) => getPortfolioValue(point))
    .filter((value) => Number.isFinite(value) && value > 0);
  const returns: number[] = [];

  for (let index = 1; index < values.length; index++) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous > 0 && current !== previous) {
      returns.push((current - previous) / previous);
    }
  }

  if (returns.length < 2) return 0;

  const average =
    returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance =
    returns.reduce((total, value) => total + (value - average) ** 2, 0) /
    returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  return Number(((average / stdDev) * Math.sqrt(returns.length)).toFixed(4));
}

function averageNumber(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

/**
 * Calculates timeline stretches where simulated capital is active or unused.
 * Each interval is counted once, so active + unused equals the measured
 * backtest window instead of the sum of all position hold durations.
 */
export function calculateQuickUnusedCapitalDurationMetrics(
  growthOvertime: GrowthOvertimeDetail[],
) {
  const points = growthOvertime
    .filter((point) => Number.isFinite(point.timeMs))
    .slice()
    .sort((left, right) => left.timeMs - right.timeMs);
  const activeDurations: number[] = [];
  const unusedDurations: number[] = [];

  for (let index = 0; index < points.length - 1; index++) {
    const point = points[index];
    const nextPoint = points[index + 1];
    const duration = nextPoint.timeMs - point.timeMs;
    if (duration <= 0) continue;

    const hasOpenPosition = (point.currentBaseAsset ?? 0) > 0;
    if (hasOpenPosition) activeDurations.push(duration);
    else unusedDurations.push(duration);
  }

  const minActiveCapitalDurationMs = activeDurations.length
    ? Math.min(...activeDurations)
    : 0;
  const totalActiveCapitalDurationMs = activeDurations.reduce(
    (total, duration) => total + duration,
    0,
  );
  const avgActiveCapitalDurationMs = averageNumber(activeDurations);
  const maxActiveCapitalDurationMs = activeDurations.length
    ? Math.max(...activeDurations)
    : 0;
  const minUnusedCapitalDurationMs = unusedDurations.length
    ? Math.min(...unusedDurations)
    : 0;
  const totalUnusedCapitalDurationMs = unusedDurations.reduce(
    (total, duration) => total + duration,
    0,
  );
  const avgUnusedCapitalDurationMs = averageNumber(unusedDurations);
  const maxUnusedCapitalDurationMs = unusedDurations.length
    ? Math.max(...unusedDurations)
    : 0;

  return {
    minActiveCapitalDurationMs,
    totalActiveCapitalDurationMs,
    avgActiveCapitalDurationMs,
    maxActiveCapitalDurationMs,
    minActiveCapitalDuration: formatDuration(minActiveCapitalDurationMs),
    totalActiveCapitalDuration: formatDuration(totalActiveCapitalDurationMs),
    avgActiveCapitalDuration: formatDuration(avgActiveCapitalDurationMs),
    maxActiveCapitalDuration: formatDuration(maxActiveCapitalDurationMs),
    minUnusedCapitalDurationMs,
    totalUnusedCapitalDurationMs,
    avgUnusedCapitalDurationMs,
    maxUnusedCapitalDurationMs,
    minUnusedCapitalDuration: formatDuration(minUnusedCapitalDurationMs),
    totalUnusedCapitalDuration: formatDuration(totalUnusedCapitalDurationMs),
    avgUnusedCapitalDuration: formatDuration(avgUnusedCapitalDurationMs),
    maxUnusedCapitalDuration: formatDuration(maxUnusedCapitalDurationMs),
  };
}

function formatDuration(ms: number) {
  return Number.isFinite(ms) && ms > 0 ? formatExactDuration(ms) : "—";
}

/**
 * Calculates the worst adverse price movement while a simulated position was
 * open. This is position drawdown, not whole-portfolio drawdown.
 */
export function calculatePositionDrawdownPct({
  position,
  volatilityPoints,
}: {
  position: Position;
  volatilityPoints: VolatilityPoint[];
}) {
  const entryPrice = Number(position.exposure.averageEntryPrice);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return 0;

  const entryTime = Number(position.opened.t ?? 0);
  const exitTime = Number(position.closed?.t ?? entryTime);
  const heldPrices = volatilityPoints
    .filter((point) => point.t >= entryTime && point.t <= exitTime)
    .map((point) => Number(point.p))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (Number.isFinite(Number(position.closed?.price))) {
    heldPrices.push(Number(position.closed?.price));
  }

  if (heldPrices.length === 0) return 0;

  if (position.direction === "SHORT") {
    const maxPrice = Math.max(...heldPrices);
    return Math.max(0, ((maxPrice - entryPrice) / entryPrice) * 100);
  }

  const minPrice = Math.min(...heldPrices);
  return Math.max(0, ((entryPrice - minPrice) / entryPrice) * 100);
}

/**
 * Summarizes position-level risk and holding duration across closed simulated
 * positions.
 */
export function calculateQuickPositionMetrics({
  positionsBySymbol,
  volatilityMap,
}: {
  positionsBySymbol: Record<string, Position[]>;
  volatilityMap: Record<string, VolatilityPoint[]>;
}) {
  const drawdowns: number[] = [];
  const holdDurations: number[] = [];

  for (const [symbol, positions] of Object.entries(positionsBySymbol)) {
    for (const position of positions) {
      drawdowns.push(
        calculatePositionDrawdownPct({
          position,
          volatilityPoints: volatilityMap[symbol] ?? [],
        }),
      );

      const holdDuration =
        (position.closed?.t ?? 0) > position.opened.t
          ? (position.closed?.t ?? 0) - position.opened.t
          : 0;
      if (Number.isFinite(holdDuration) && holdDuration > 0) {
        holdDurations.push(holdDuration);
      }
    }
  }

  const minHoldDurationMs = holdDurations.length
    ? Math.min(...holdDurations)
    : 0;
  const maxHoldDurationMs = holdDurations.length
    ? Math.max(...holdDurations)
    : 0;
  const totalHoldDurationMs = holdDurations.reduce(
    (total, duration) => total + duration,
    0,
  );
  const avgHoldDurationMs = holdDurations.length
    ? holdDurations.reduce((total, item) => total + item, 0) /
      holdDurations.length
    : 0;

  return {
    maxPositionDrawdownPct: drawdowns.length ? Math.max(...drawdowns) : 0,
    minHoldDurationMs,
    totalHoldDurationMs,
    avgHoldDurationMs,
    maxHoldDurationMs,
    minHoldDuration: formatDuration(minHoldDurationMs),
    totalHoldDuration: formatDuration(totalHoldDurationMs),
    avgHoldDuration: formatDuration(avgHoldDurationMs),
    maxHoldDuration: formatDuration(maxHoldDurationMs),
  };
}

/**
 * Converts balance snapshots into the small chart series shape used by the
 * dashboard growth chart.
 */
export function growthOvertimeToQuickSeries(
  growthOvertime: GrowthOvertimeDetail[],
): SlowQuickBacktestResult["growthOvertimeSeries"] {
  const points = growthOvertime.map((point) => ({
    ...point,
    timeSec: Math.floor(point.timeMs / 1000),
  }));

  return {
    names: [
      "Current Balance",
      "Spendable Balance",
      "Reserved Balance",
      "Current Asset",
      "Current Asset Floating",
      "Current Safe Haven",
    ],
    series: [
      points.map((point) => ({
        time: point.timeSec,
        level: point.currentBalance,
      })),
      points.map((point) => ({
        time: point.timeSec,
        level: point.currentSpendableBalance ?? point.currentBalance,
      })),
      points.map((point) => ({
        time: point.timeSec,
        level: point.currentReservedBalance ?? 0,
      })),
      points.map((point) => ({
        time: point.timeSec,
        level: point.currentAsset,
      })),
      points.map((point) => ({
        time: point.timeSec,
        level: point.currentAssetFloating,
      })),
      points.map((point) => ({
        time: point.timeSec,
        level: point.currentSafeHaven,
      })),
    ],
  };
}

/**
 * Normalizes a marker level while preserving the chart's real vPoint scale.
 */
function getFiniteLevel(value: unknown, fallback = 0) {
  const level = Number(value);
  return Number.isFinite(level) ? level : fallback;
}

function makeSimulationEntryMarker(position: Position): LeveledMarkers {
  return {
    time: Math.floor((position.opened.t ?? 0) / 1000),
    level: getFiniteLevel(position.opened.vPoint.lvl),
    color: position.direction === "SHORT" ? "#dc2626" : "#16a34a",
    text:
      `TRADE SIMULATION ENTRY ${position.symbol ?? ""} ` +
      `L${position.opened.vPoint.lvl ?? 0} ${position.direction ?? ""} ` +
      `$${(position.exposure.notionalUsdt ?? 0).toFixed(2)} @ ${position.exposure.averageEntryPrice}`,
  };
}

function makeSimulationExitMarker(position: Position): LeveledMarkers {
  return {
    time: Math.floor((position.closed?.t ?? position.opened.t) / 1000),
    level: getFiniteLevel(
      position.closed?.vPoint?.lvl,
      getFiniteLevel(position.opened.vPoint.lvl),
    ),
    color: (position.pnl.netUsdt ?? 0) >= 0 ? "#2563eb" : "#f97316",
    text:
      `TRADE SIMULATION EXIT ${position.symbol ?? ""} ` +
      `L${position.closed?.vPoint?.lvl ?? position.opened.vPoint.lvl} ` +
      `$${(position.pnl.netUsdt ?? 0).toFixed(2)} ` +
      `${(position.pnl.netPct ?? 0).toFixed(2)}% @ ${position.closed?.price ?? "?"}`,
  };
}

function makeSimulationAveragingMarkers(position: Position): LeveledMarkers[] {
  const triggers = position.strategy.averaging.executions ?? [];
  const entryLevel = getFiniteLevel(position.opened.vPoint.lvl);

  return triggers
    .filter((trigger) => Number.isFinite(trigger.t))
    .map((trigger) => ({
      time: Math.floor(trigger.t / 1000),
      level: getFiniteLevel(trigger.level, entryLevel),
      color: "#7c3aed",
      text:
        `TRADE SIMULATION AVG ${position.symbol ?? ""} ` +
        `L${trigger.level} ` +
        `$${trigger.marginUsdt.toFixed(2)} @ ${trigger.price}`,
    }));
}

/**
 * Builds entry/averaging/exit marker lines for the Volatility Points chart.
 */
export function positionsToQuickSimulationSeries(
  positionsBySymbol: Record<string, Position[]>,
): SlowQuickBacktestResult["simulationSeries"] {
  const names: string[] = [];
  const series: LeveledMarkers[][] = [];

  for (const [symbol, positions] of Object.entries(positionsBySymbol)) {
    for (const position of positions) {
      names.push(`TRADE SIMULATION ${symbol}`);
      series.push([
        makeSimulationEntryMarker(position),
        makeSimulationExitMarker(position),
      ]);

      for (const averagingMarker of makeSimulationAveragingMarkers(position)) {
        names.push(`TRADE SIMULATION ${symbol}`);
        series.push([averagingMarker]);
      }
    }
  }

  return { names, series };
}

/**
 * Calculates unlevered PnL percent for a position at a rail price.
 */
function calculateQuickPositionPnlPct(position: Position, price: number) {
  const entryPrice = Number(position.exposure.averageEntryPrice);
  const currentPrice = Number(price);
  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0
  ) {
    return null;
  }

  const rawPct =
    position.direction === "SHORT"
      ? ((entryPrice - currentPrice) / entryPrice) * 100
      : ((currentPrice - entryPrice) / entryPrice) * 100;

  return Number(rawPct.toFixed(3));
}

/**
 * Builds per-trade PnL history from the visible volatility rail so the shared
 * trade-history table can show max run-up and max drawdown for Quick Backtest.
 */
function buildQuickPositionPnlHistory({
  position,
  volatilityPoints,
}: {
  position: Position;
  volatilityPoints: VolatilityPoint[];
}): NonNullable<SlowTradingHistoryPosition["pnl"]["history"]> {
  const entryTime = Number(position.opened.t ?? 0);
  const exitTime = Number(position.closed?.t ?? entryTime);
  const points = volatilityPoints
    .filter((point) => point.t >= entryTime && point.t <= exitTime)
    .map((point) => ({
      t: point.t,
      pct: calculateQuickPositionPnlPct(position, point.p),
    }))
    .filter(
      (point): point is { t: number; pct: number } =>
        Number.isFinite(point.t) && point.pct !== null,
    );

  const entryPct = calculateQuickPositionPnlPct(position, position.exposure.averageEntryPrice);
  if (Number.isFinite(entryTime) && entryPct !== null) {
    points.push({ t: entryTime, pct: entryPct });
  }

  if (
    Number.isFinite(exitTime) &&
    Number.isFinite(Number(position.pnl.netPct))
  ) {
    points.push({
      t: exitTime,
      pct: Number(Number(position.pnl.netPct).toFixed(3)),
    });
  } else if (
    Number.isFinite(exitTime) &&
    Number.isFinite(Number(position.closed?.price))
  ) {
    const exitPct = calculateQuickPositionPnlPct(
      position,
      Number(position.closed?.price),
    );
    if (exitPct !== null) {
      points.push({ t: exitTime, pct: exitPct });
    }
  }

  const byTime = new Map<number, number>();
  for (const point of points) {
    byTime.set(point.t, point.pct);
  }

  return Array.from(byTime.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([t, pct]) => ({ t, pct }));
}

/**
 * Flattens closed simulated positions into the SLOW history table row shape.
 */
export function positionsToQuickTradeHistory(
  positionsBySymbol: Record<string, Position[]>,
  volatilityMap: Record<string, VolatilityPoint[]> = {},
): SlowTradingHistoryPosition[] {
  return Object.entries(positionsBySymbol)
    .flatMap(([symbol, positions]) =>
      positions.map((position) => {
        const normalizedSymbol = (position.symbol ?? symbol).toUpperCase();
        const intermediateVPoints =
          position.vPoints ??
          tradingPosition.vPoints.intermediate({
            position,
            volatilityPoints: volatilityMap[normalizedSymbol] ?? [],
          });
        const history = buildQuickPositionPnlHistory({
          position,
          volatilityPoints: volatilityMap[normalizedSymbol] ?? [],
        });
        const pctValues = history
          .map((point) => point.pct)
          .filter((value) => Number.isFinite(value));
        const usdtValues = [
          position.pnl.maxUpUsdt,
          position.pnl.maxDownUsdt,
          position.pnl.netUsdt,
        ].filter((value): value is number => Number.isFinite(value));

        return {
          ...position,
          executionMode: "sandbox" as const,
          mode: "sandbox" as const,
          ...(intermediateVPoints !== undefined && {
            vPoints: intermediateVPoints,
          }),
          pnl: {
            ...position.pnl,
            history,
            maxDownPct: pctValues.length ? Math.min(...pctValues) : 0,
            maxUpPct: pctValues.length ? Math.max(...pctValues) : 0,
            // BOTH:POSITION_PNL_USDT_EXTREMA
            maxDownUsdt: usdtValues.length ? Math.min(...usdtValues) : 0,
            maxUpUsdt: usdtValues.length ? Math.max(...usdtValues) : 0,
          },
          symbol: normalizedSymbol,
        };
      }),
    )
    .sort(
      (left, right) =>
        (right.closed?.t ?? 0) - (left.closed?.t ?? 0),
    );
}

/**
 * Runs a demand-only SLOW dashboard backtest from visible/ranged volatility
 * points without writing live SLOW memory or loading background datasets.
 */
async function runSingle({
  volatilityMap,
  config,
  startAmount = 100,
  startTime,
  endTime,
  range = "custom",
  signal,
  volume24hBySymbol,
  verbose = false,
  accountSlug = DEFAULT_EXCHANGE_ACCOUNT_SLUG,
}: SlowQuickBacktestInput & {
  accountSlug?: string;
}): Promise<SlowQuickBacktestResult> {
  const symbols = Array.from(
    new Set([...config.symbols, "BTC"].map((symbol) => symbol.toUpperCase())),
  );
  const configForBacktest: BacktestConfigDynamic = {
    ...cloneJson(config),
    startingBalanceUSDT: Number.isFinite(startAmount) ? startAmount : 100,
  };
  const decisionEngine =
    DECISION_ENGINE_MAP[
      config.decisionEngineVersion ?? PRODUCTION_DECISION_ENGINE
    ] ?? DECISION_ENGINE_MAP[PRODUCTION_DECISION_ENGINE];

  const backtest = await runWithExchangeAccount(
    {
      slug: accountSlug,
      type: "binance",
      name: accountSlug,
      description: "",
      credentials: { apiKey: "", apiSecret: "" },
      createdAt: 0,
      updatedAt: 0,
    },
    () =>
      runBacktestVolatilityDynamic({
        symbols,
        interval: "5m",
        range,
        signal,
        startTime,
        endTime,
        useVolatilityCache: false,
        entryCutoffBufferMs: QUICK_BACKTEST_ENTRY_CUTOFF_BUFFER_MS,
        volatilityMap,
        warmupVolatilityMap: volatilityMap,
        volume24hBySymbol,
        config: configForBacktest,
        decisionEngine,
        verbose,
      }),
  );

  const growth = backtest.backtestPack.growthOvertime;
  const finalPortfolioValue =
    getPortfolioValue(growth.at(-1)) ||
    backtest.dynamicTradeMemory.quoteAsset +
      backtest.dynamicTradeMemory.safeHaven;
  const gainUsdt = finalPortfolioValue - configForBacktest.startingBalanceUSDT;
  const gainPct =
    configForBacktest.startingBalanceUSDT > 0
      ? (gainUsdt / configForBacktest.startingBalanceUSDT) * 100
      : 0;
  const firstTime = growth[0]?.timeMs ?? startTime ?? 0;
  const lastTime = growth.at(-1)?.timeMs ?? endTime ?? firstTime;
  const weeks = Math.max(1, (lastTime - firstTime) / (7 * 24 * 60 * 60 * 1000));
  const positionsBySymbol = Object.fromEntries(
    Object.entries(backtest.backtestPack.modelMemoryMap).map(
      ([symbol, memory]) => [symbol, memory.positionsSell ?? []],
    ),
  );
  const entryCount = Object.values(positionsBySymbol).reduce(
    (total, positions) => total + positions.length,
    0,
  );
  const positionMetrics = calculateQuickPositionMetrics({
    positionsBySymbol,
    volatilityMap,
  });
  const unusedCapitalMetrics =
    calculateQuickUnusedCapitalDurationMetrics(growth);

  // PROD:QUICK_BACKTEST_VISIBLE_VPOINTS
  return {
    metrics: {
      entryCount,
      sharpeRatio: calculateQuickSharpeRatio(growth),
      gainPct,
      gainUsdt,
      finalUsdt: finalPortfolioValue,
      avgProfitUsdtPerWeek: gainUsdt / weeks,
      ...positionMetrics,
      ...unusedCapitalMetrics,
    },
    tradeHistory: positionsToQuickTradeHistory(
      positionsBySymbol,
      volatilityMap,
    ),
    growthOvertimeSeries: growthOvertimeToQuickSeries(growth),
    simulationSeries: positionsToQuickSimulationSeries(positionsBySymbol),
  };
}

function minPositive(values: number[]) {
  const positive = values.filter((value) => value > 0);
  return positive.length > 0 ? Math.min(...positive) : 0;
}

/**
 * Combines sparse account growth series using the latest value per timestamp.
 * Each account's last known value is carried forward until its next snapshot.
 */
export function combineQuickGrowthSeries(
  accountResults: Array<{
    result: Pick<SlowQuickBacktestResult, "growthOvertimeSeries">;
  }>,
): SlowQuickBacktestResult["growthOvertimeSeries"] {
  const names = accountResults[0]?.result.growthOvertimeSeries.names ?? [];
  return {
    names,
    series: names.map((_, seriesIndex) => {
      const pointsByAccount = accountResults.map((account) => {
        const latestByTime = new Map<number, LeveledMarkers>();
        for (const point of
          account.result.growthOvertimeSeries.series[seriesIndex] ?? []) {
          if (Number.isFinite(point.time) && Number.isFinite(point.level)) {
            latestByTime.set(point.time, point);
          }
        }

        return [...latestByTime.values()].sort(
          (left, right) => left.time - right.time,
        );
      });
      const times = [
        ...new Set(
          pointsByAccount.flatMap((points) =>
            points.map((point) => point.time),
          ),
        ),
      ].sort((left, right) => left - right);
      const cursors = pointsByAccount.map(() => 0);
      const latestLevels = pointsByAccount.map(() => 0);

      // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
      return times.map((time) => {
        pointsByAccount.forEach((points, accountIndex) => {
          while (
            cursors[accountIndex] < points.length &&
            points[cursors[accountIndex]].time <= time
          ) {
            latestLevels[accountIndex] =
              points[cursors[accountIndex]].level;
            cursors[accountIndex] += 1;
          }
        });

        return {
          time,
          level: latestLevels.reduce((total, level) => total + level, 0),
        };
      });
    }),
  };
}

/** Combines account markers under the chart's single TRADE SIMULATION group. */
export function combineQuickSimulationSeries(
  accountResults: Array<{
    name: string;
    result: Pick<SlowQuickBacktestResult, "simulationSeries">;
  }>,
): SlowQuickBacktestResult["simulationSeries"] {
  // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
  return {
    names: accountResults.flatMap(
      (account) => account.result.simulationSeries.names,
    ),
    series: accountResults.flatMap((account) =>
      account.result.simulationSeries.series.map((markers) =>
        markers.map((marker) => ({
          ...marker,
          text: marker.text
            ? `${account.name}: ${marker.text}`
            : marker.text,
        })),
      ),
    ),
  };
}

/** Runs every enabled account and combines their trades into one report. */
async function run(
  input: SlowQuickBacktestInput,
): Promise<SlowQuickBacktestResult> {
  const enabledAccounts = (input.accounts ?? []).filter(
    (account) => account.enabled,
  );
  if (input.accounts && enabledAccounts.length === 0) {
    throw new Error("Enable at least one account before running Quick Backtest.");
  }
  if (enabledAccounts.length === 0) return runSingle(input);

  const accountResults: Array<{
    name: string;
    startAmount: number;
    result: SlowQuickBacktestResult;
  }> = [];
  // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
  for (const account of enabledAccounts) {
    accountResults.push({
      name: account.name || account.slug,
      startAmount: account.startAmount,
      result: await runSingle({
        ...input,
        accounts: undefined,
        accountSlug: account.slug,
        config: account.config,
        startAmount: account.startAmount,
      }),
    });
  }

  const metrics = accountResults.map((account) => account.result.metrics);
  const startingUsdt = accountResults.reduce(
    (total, account) => total + account.startAmount,
    0,
  );
  const finalUsdt = metrics.reduce((total, item) => total + item.finalUsdt, 0);
  const gainUsdt = finalUsdt - startingUsdt;
  const entryCount = metrics.reduce((total, item) => total + item.entryCount, 0);
  const totalHoldDurationMs = metrics.reduce(
    (total, item) => total + item.totalHoldDurationMs,
    0,
  );
  const totalActiveCapitalDurationMs = metrics.reduce(
    (total, item) => total + item.totalActiveCapitalDurationMs,
    0,
  );
  const totalUnusedCapitalDurationMs = metrics.reduce(
    (total, item) => total + item.totalUnusedCapitalDurationMs,
    0,
  );

  return {
    metrics: {
      entryCount,
      sharpeRatio:
        entryCount > 0
          ? metrics.reduce(
              (total, item) => total + item.sharpeRatio * item.entryCount,
              0,
            ) / entryCount
          : 0,
      gainPct: startingUsdt > 0 ? (gainUsdt / startingUsdt) * 100 : 0,
      gainUsdt,
      finalUsdt,
      avgProfitUsdtPerWeek: metrics.reduce(
        (total, item) => total + item.avgProfitUsdtPerWeek,
        0,
      ),
      maxPositionDrawdownPct: Math.max(
        0,
        ...metrics.map((item) => item.maxPositionDrawdownPct),
      ),
      minHoldDurationMs: minPositive(
        metrics.map((item) => item.minHoldDurationMs),
      ),
      totalHoldDurationMs,
      avgHoldDurationMs: entryCount > 0 ? totalHoldDurationMs / entryCount : 0,
      maxHoldDurationMs: Math.max(
        0,
        ...metrics.map((item) => item.maxHoldDurationMs),
      ),
      minHoldDuration: formatDuration(
        minPositive(metrics.map((item) => item.minHoldDurationMs)),
      ),
      totalHoldDuration: formatDuration(totalHoldDurationMs),
      avgHoldDuration: formatDuration(
        entryCount > 0 ? totalHoldDurationMs / entryCount : 0,
      ),
      maxHoldDuration: formatDuration(
        Math.max(0, ...metrics.map((item) => item.maxHoldDurationMs)),
      ),
      minActiveCapitalDurationMs: minPositive(
        metrics.map((item) => item.minActiveCapitalDurationMs),
      ),
      totalActiveCapitalDurationMs,
      avgActiveCapitalDurationMs:
        totalActiveCapitalDurationMs / accountResults.length,
      maxActiveCapitalDurationMs: Math.max(
        0,
        ...metrics.map((item) => item.maxActiveCapitalDurationMs),
      ),
      minActiveCapitalDuration: formatDuration(
        minPositive(metrics.map((item) => item.minActiveCapitalDurationMs)),
      ),
      totalActiveCapitalDuration: formatDuration(totalActiveCapitalDurationMs),
      avgActiveCapitalDuration: formatDuration(
        totalActiveCapitalDurationMs / accountResults.length,
      ),
      maxActiveCapitalDuration: formatDuration(
        Math.max(0, ...metrics.map((item) => item.maxActiveCapitalDurationMs)),
      ),
      minUnusedCapitalDurationMs: minPositive(
        metrics.map((item) => item.minUnusedCapitalDurationMs),
      ),
      totalUnusedCapitalDurationMs,
      avgUnusedCapitalDurationMs:
        totalUnusedCapitalDurationMs / accountResults.length,
      maxUnusedCapitalDurationMs: Math.max(
        0,
        ...metrics.map((item) => item.maxUnusedCapitalDurationMs),
      ),
      minUnusedCapitalDuration: formatDuration(
        minPositive(metrics.map((item) => item.minUnusedCapitalDurationMs)),
      ),
      totalUnusedCapitalDuration: formatDuration(totalUnusedCapitalDurationMs),
      avgUnusedCapitalDuration: formatDuration(
        totalUnusedCapitalDurationMs / accountResults.length,
      ),
      maxUnusedCapitalDuration: formatDuration(
        Math.max(0, ...metrics.map((item) => item.maxUnusedCapitalDurationMs)),
      ),
    },
    tradeHistory: accountResults
      .flatMap((account) => account.result.tradeHistory)
      .sort((left, right) => (right.closed?.t ?? 0) - (left.closed?.t ?? 0)),
    growthOvertimeSeries: combineQuickGrowthSeries(accountResults),
    simulationSeries: combineQuickSimulationSeries(accountResults),
  };
}

const slowQuickBacktest = {
  run,
  report: {
    combineQuickGrowthSeries,
    combineQuickSimulationSeries,
    growthOvertimeToQuickSeries,
    calculatePositionDrawdownPct,
    calculateQuickPositionMetrics,
    calculateQuickSharpeRatio,
    calculateQuickUnusedCapitalDurationMetrics,
    positionsToQuickSimulationSeries,
    positionsToQuickTradeHistory,
  },
} as const;

export default slowQuickBacktest;
