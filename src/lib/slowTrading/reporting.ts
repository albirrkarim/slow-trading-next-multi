import type {
  Position,
  PositionMonitoringStage,
  PositionPnlPoint,
} from "@/lib/trading/models";
import type {
  ExchangeType,
  UnifiedFundingRate,
} from "@/lib/exchange/types";
import { getFeeCalculator } from "@/lib/exchange/fees";
import { TokocryptoFees } from "@/lib/exchange/platform/tokocrypto";
import {
  applyPositionNetUsdtExtrema,
  computeClosedPositionMetrics,
} from "@/lib/trading/pnl";
import type { SlowTradingHistoryPosition, SlowTradingModeState } from "./types";
import slowTradingPnlHistory from "./pnl-history";

const MAX_HISTORY_POINTS = 24 * 90;
const DEFAULT_ROUND_TRIP_FEE_RATIO =
  TokocryptoFees.getBothSideFeePercent({
    type: "taker",
  }) / 100;

/** Normalized PnL-history point used by reporting helpers. */
type ReportHistoryPoint = PositionPnlPoint;

/**
 * Rounds pct to the SLOW USDT precision.
 */
function roundPct(value: number): number {
  return Number(value.toFixed(3));
}

/**
 * Rounds USDT to the SLOW precision.
 */
function roundUsdt(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Checks whether finite number matches the SLOW rule.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Normalizes slow trading history points into the shape expected by SLOW.
 */
export function normalizeSlowTradingHistoryPoints(
  raw: unknown,
): ReportHistoryPoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (isFiniteNumber(item?.t) && isFiniteNumber(item?.pct)) {
        return {
          t: item.t,
          pct: roundPct(item.pct),
        };
      }

      if (isFiniteNumber(item?.timeMs) && isFiniteNumber(item?.percent)) {
        return {
          t: item.timeMs,
          pct: roundPct(item.percent),
        };
      }

      return null;
    })
    .filter((item): item is ReportHistoryPoint => item !== null)
    .sort((a, b) => a.t - b.t);
}

/**
 * Handles the compute slow trading pnl percent SLOW flow from input through output.
 */
export function computeSlowTradingPnlPercent(
  position: Pick<Position, "direction" | "exposure">,
  price: number,
): number | null {
  const entryPrice = Number(position.exposure.averageEntryPrice);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  const isShort = position.direction === "SHORT";
  const gain = isShort
    ? (entryPrice - price) / entryPrice
    : (price - entryPrice) / entryPrice;

  return roundPct(gain * 100);
}

/**
 * Upserts history point into SLOW persistent storage.
 */
function upsertHistoryPoint(
  history: ReportHistoryPoint[],
  point: ReportHistoryPoint,
  replaceWithinBucket: boolean,
  bucketMs = slowTradingPnlHistory.bucket.resolveMs(undefined),
): ReportHistoryPoint[] {
  if (!isFiniteNumber(point.t) || !isFiniteNumber(point.pct)) {
    return history;
  }

  if (history.length === 0) {
    return [point];
  }

  const next = [...history].sort((a, b) => a.t - b.t);
  const last = next.at(-1);
  if (!last) {
    return [point];
  }

  if (replaceWithinBucket) {
    const lastBucket = Math.floor(last.t / bucketMs);
    const nextBucket = Math.floor(point.t / bucketMs);

    if (lastBucket === nextBucket) {
      next[next.length - 1] = point;
    } else if (point.t > last.t) {
      next.push(point);
    }
  } else {
    const existingIndex = next.findIndex((item) => item.t === point.t);
    if (existingIndex >= 0) {
      next[existingIndex] = point;
    } else {
      next.push(point);
    }
  }

  next.sort((a, b) => a.t - b.t);
  if (next.length > MAX_HISTORY_POINTS) {
    return next.slice(next.length - MAX_HISTORY_POINTS);
  }

  return next;
}

/**
 * Ensures report position exists before the SLOW flow continues.
 */
function ensureReportPosition<T extends Position>(
  position: T,
): T {
  const next = position;

  next.pnl.history = normalizeSlowTradingHistoryPoints(
    next.pnl.history,
  );

  return next;
}

/**
 * Gets round trip fee ratio from SLOW state or storage.
 */
function getRoundTripFeeRatio(exchangeType?: ExchangeType): number {
  if (!exchangeType) {
    return DEFAULT_ROUND_TRIP_FEE_RATIO;
  }

  return getFeeCalculator(exchangeType).getBothSideFeePercent({
    type: "taker",
  }) / 100;
}

/**
 * Applies the fee estimate used by floating SLOW PnL.
 */
function applyFloatingFeeEstimate<T extends Position>(
  position: T,
  roundTripFeeRatio: number,
): T {
  const entryNotional = Number(position.exposure.notionalUsdt) || 0;
  if (!(entryNotional > 0) || !(roundTripFeeRatio > 0)) {
    return position;
  }

  const estimatedTotalFee = entryNotional * roundTripFeeRatio;
  const entryFee =
    isFiniteNumber(position.fees.entryUsdt) &&
    position.fees.entryUsdt >= 0
      ? position.fees.entryUsdt
      : estimatedTotalFee / 2;
  const exitFee = Math.max(0, estimatedTotalFee - entryFee);

  position.fees.entryUsdt = roundUsdt(entryFee);
  position.fees.estimatedExitUsdt = roundUsdt(exitFee);

  return position;
}

/**
 * Applies floating PnL metrics to an open SLOW position.
 */
export function applyFloatingSlowTradingPositionMetrics<T extends Position>(
  position: T,
  price: number,
  exchangeType?: ExchangeType,
): boolean {
  const roundTripFeeRatio = exchangeType ? getRoundTripFeeRatio(exchangeType) : 0;
  const metrics = computeClosedPositionMetrics(
    position,
    price,
    roundTripFeeRatio,
  );
  if (!metrics) {
    return false;
  }

  position.pnl.netPct = metrics.netProfitPercent;
  position.pnl.netUsdt = metrics.netProfitUSDT;
  // BOTH:POSITION_PNL_USDT_EXTREMA
  applyPositionNetUsdtExtrema(position, metrics.netProfitUSDT);
  position.pnl.currentValueUsdt = metrics.netCurrentUSDT;
  position.pnl.markPrice = price;
  applyFloatingFeeEstimate(position, roundTripFeeRatio);

  return true;
}

/**
 * Applies closed position metrics to the provided SLOW state.
 */
function applyClosedPositionMetrics<T extends Position>(
  position: T,
  roundTripFeeRatio: number,
): T {
  const exitPrice = Number(position.closed?.price);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    return position;
  }

  const metrics = computeClosedPositionMetrics(
    position,
    exitPrice,
    roundTripFeeRatio,
  );
  if (!metrics) {
    return position;
  }

  position.pnl.netPct = metrics.netProfitPercent;
  position.pnl.netUsdt = metrics.netProfitUSDT;
  // BOTH:POSITION_PNL_USDT_EXTREMA
  applyPositionNetUsdtExtrema(position, metrics.netProfitUSDT);
  position.pnl.currentValueUsdt = metrics.netCurrentUSDT;

  return position;
}

/**
 * Seeds synthetic history with deterministic SLOW sample data.
 */
function seedSyntheticHistory<T extends SlowTradingHistoryPosition>(
  position: T,
  roundTripFeeRatio: number,
): T {
  // A. Ensure closed-position metrics and history arrays exist.
  const next = applyClosedPositionMetrics(
    ensureReportPosition(position),
    roundTripFeeRatio,
  );
  let history = [...(next.pnl.history ?? [])];

  // B. Seed explicit entry and exit points when they are missing.
  if (isFiniteNumber(next.opened.t)) {
    history = upsertHistoryPoint(
      history,
      {
        t: next.opened.t,
        pct: 0,
      },
      false,
    );
  }

  if (isFiniteNumber(next.closed?.t) && isFiniteNumber(next.pnl.netPct)) {
    history = upsertHistoryPoint(
      history,
      {
        t: next.closed?.t,
        pct: roundPct(next.pnl.netPct),
      },
      false,
    );
  }

  if (history.length === 0 && isFiniteNumber(next.opened.t)) {
    history = [
      {
        t: next.opened.t,
        pct: isFiniteNumber(next.pnl.netPct)
          ? roundPct(next.pnl.netPct)
          : 0,
      },
    ];
  }

  next.pnl.history = history;

  // C. Recompute run-up and drawdown from every available history source.
  const pctValues = history
    .map((item) => item.pct)
    .filter((value): value is number => isFiniteNumber(value));

  if (isFiniteNumber(next.pnl.maxUpPct)) {
    pctValues.push(next.pnl.maxUpPct);
  }
  if (isFiniteNumber(next.pnl.maxDownPct)) {
    pctValues.push(next.pnl.maxDownPct);
  }
  if (isFiniteNumber(next.pnl.netPct)) {
    pctValues.push(next.pnl.netPct);
  }

  if (pctValues.length > 0) {
    next.pnl.maxUpPct = roundPct(Math.max(...pctValues));
    next.pnl.maxDownPct = roundPct(Math.min(...pctValues));
  }

  if (isFiniteNumber(next.pnl.netUsdt)) {
    // Legacy histories can at least retain their final close as an observation.
    applyPositionNetUsdtExtrema(next, next.pnl.netUsdt);
  }

  return next;
}

/**
 * Normalizes slow trading position for reporting into the shape expected by SLOW.
 */
export function normalizeSlowTradingPositionForReporting<
  T extends SlowTradingHistoryPosition,
>(position: T, exchangeType?: ExchangeType): T {
  return seedSyntheticHistory({
    ...position,
  }, getRoundTripFeeRatio(exchangeType));
}

/**
 * Normalizes slow trading positions for reporting into the shape expected by SLOW.
 */
export function normalizeSlowTradingPositionsForReporting<
  T extends SlowTradingHistoryPosition,
>(positions: T[], exchangeType?: ExchangeType): T[] {
  return positions.map((position) =>
    normalizeSlowTradingPositionForReporting(position, exchangeType),
  );
}

/**
 * Applies observation to the provided SLOW state.
 */
function applyObservation(
  position: Position,
  observation: {
    pct: number;
    timeMs: number;
    replaceWithinBucket: boolean;
    bucketMs: number;
  },
) {
  // PROD:MONITORING_OPEN_POSITION
  const next = ensureReportPosition(position);
  next.pnl.history = upsertHistoryPoint(
    next.pnl.history ?? [],
    {
      t: observation.timeMs,
      pct: roundPct(observation.pct),
    },
    observation.replaceWithinBucket,
    observation.bucketMs,
  );

  next.pnl.maxUpPct = isFiniteNumber(next.pnl.maxUpPct)
    ? roundPct(Math.max(next.pnl.maxUpPct, observation.pct))
    : roundPct(observation.pct);
  next.pnl.maxDownPct = isFiniteNumber(next.pnl.maxDownPct)
    ? roundPct(Math.min(next.pnl.maxDownPct, observation.pct))
    : roundPct(observation.pct);
}

/** Persists a newer valid perpetual-futures funding snapshot on a position. */
function applyFundingSnapshot(params: {
  exchangeType?: ExchangeType;
  fundingRate?: UnifiedFundingRate;
  position: Position;
}) {
  const { exchangeType, fundingRate, position } = params;
  if (
    !exchangeType ||
    position.tradingMode !== "futures" ||
    !fundingRate ||
    !isFiniteNumber(fundingRate.rate) ||
    !isFiniteNumber(fundingRate.t) ||
    fundingRate.t <= 0 ||
    (position.funding?.t ?? 0) > fundingRate.t
  ) {
    return false;
  }

  position.funding = {
    exchange: exchangeType,
    rate: fundingRate.rate,
    t: fundingRate.t,
    ...(isFiniteNumber(fundingRate.nextFundingTime) &&
    fundingRate.nextFundingTime > 0
      ? { nextT: fundingRate.nextFundingTime }
      : {}),
  };
  return true;
}

/**
 * Syncs slow trading mode state reporting into the SLOW mode state.
 */
export function syncSlowTradingModeStateReporting(params: {
  exchangeType?: ExchangeType;
  modeState: SlowTradingModeState;
  latestPriceBySymbol: Record<string, number>;
  fundingRateBySymbol?: Record<string, UnifiedFundingRate>;
  currentTimeMs: number;
  updatedAtMs?: number;
  historyBucketMinutes?: number;
  monitoring?: {
    stage: PositionMonitoringStage;
    reasonByPosition: Record<string, string>;
  };
}) {
  // A. Scan every configured symbol for open positions.
  const { currentTimeMs, exchangeType, latestPriceBySymbol, modeState } =
    params;
  const historyBucketMs = slowTradingPnlHistory.bucket.resolveMs(
    params.historyBucketMinutes,
  );

  for (const tradeSetting of modeState.tradeSettings) {
    const symbol = String(tradeSetting.symbol || "")
      .trim()
      .toUpperCase();
    const latestPrice = latestPriceBySymbol[symbol];

    const openPositions = (tradeSetting.model_memory.positions ?? []).filter(
      (position) => !position.closed,
    ) as Position[];

    // B. Append a current floating-PnL observation for each open position.
    for (const openPosition of openPositions) {
      // PROD:MONITORING_POSITION_FUNDING_RATE
      applyFundingSnapshot({
        exchangeType,
        fundingRate: params.fundingRateBySymbol?.[symbol],
        position: openPosition,
      });

      if (
        !applyFloatingSlowTradingPositionMetrics(
          openPosition,
          latestPrice,
          exchangeType,
        )
      ) {
        continue;
      }

      applyObservation(openPosition, {
        pct: openPosition.pnl.netPct ?? 0,
        timeMs: currentTimeMs,
        replaceWithinBucket: true,
        bucketMs: historyBucketMs,
      });
      if (params.monitoring) {
        // PROD:SPEEDUP_STAGE
        // PROD:STANDARD_MONITORING_STAGE
        openPosition.lastMonitoringStage = {
          stage: params.monitoring.stage,
          lastUpdated: params.updatedAtMs ?? currentTimeMs,
          reason:
            params.monitoring.reasonByPosition[
              makeMonitoringPositionKey(symbol, openPosition)
            ] ?? "Monitoring stage completed",
        };
      }
    }
  }
}

/** Builds the stable in-memory key used to attach monitoring diagnostics. */
function makeMonitoringPositionKey(
  symbol: string,
  position: Pick<Position, "opened">,
): string {
  return `${String(symbol || "").trim().toUpperCase()}:${position.opened.t}`;
}

/**
 * Grouped reporting API for SLOW callers that need related reporting helpers.
 */
const slowTradingReporting = {
  history: {
    bucket: slowTradingPnlHistory.bucket,
    normalizePoints: normalizeSlowTradingHistoryPoints,
  },
  pnl: {
    applyFloatingMetrics: applyFloatingSlowTradingPositionMetrics,
    computePercent: computeSlowTradingPnlPercent,
  },
  positions: {
    applyFundingSnapshot,
    monitoringKey: makeMonitoringPositionKey,
    normalize: normalizeSlowTradingPositionForReporting,
    normalizeMany: normalizeSlowTradingPositionsForReporting,
  },
  modeState: {
    sync: syncSlowTradingModeStateReporting,
  },
} as const;

export default slowTradingReporting;
export { slowTradingReporting };
