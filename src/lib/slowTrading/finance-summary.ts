import type { SlowTradingMode } from "./types";

// PROD:MCP_FINANCE_SUMMARY

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 731;

interface SlowTradingFinancePosition {
  closed?: {
    feeUsdt?: number;
    t?: number;
  };
  fees?: {
    entryUsdt?: number;
  };
  pnl?: {
    netUsdt?: number;
  };
}

export interface SlowTradingFinanceDailyPoint {
  closedTradeCount: number;
  date: string;
  grossLossUsdt: number;
  grossProfitUsdt: number;
  knownFeesUsdt: number;
  realizedNetPnlUsdt: number;
}

export interface SlowTradingFinanceSummary {
  closedTradeCount: number;
  currency: "USDT";
  daily: SlowTradingFinanceDailyPoint[];
  flatTradeCount: number;
  generatedAt: string;
  grossLossUsdt: number;
  grossProfitUsdt: number;
  includedTradeCount: number;
  instanceName: string;
  knownFeesUsdt: number;
  losingTradeCount: number;
  message: string | null;
  missingPnlTradeCount: number;
  mode: SlowTradingMode;
  period: {
    days: number;
    end: string;
    start: string;
  };
  realizedNetPnlUsdt: number;
  status: "partial" | "ready";
  winningTradeCount: number;
}

interface DateRange {
  days: number;
  end: string;
  endExclusiveMs: number;
  start: string;
  startMs: number;
}

function roundUsdt(value: number): number {
  return Number(value.toFixed(6));
}

function parseUtcDay(value: unknown, name: "end" | "start"): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid UTC calendar date.`);
  }

  return parsed.getTime();
}

/** Resolves an inclusive, bounded UTC date range for finance aggregation. */
function resolveRange(start: unknown, end: unknown): DateRange {
  const startMs = parseUtcDay(start, "start");
  const endMs = parseUtcDay(end, "end");
  if (startMs > endMs) throw new Error("start must be on or before end.");

  const days = Math.floor((endMs - startMs) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new Error(`Finance summary range cannot exceed ${MAX_RANGE_DAYS} days.`);
  }

  return {
    days,
    end: String(end),
    endExclusiveMs: endMs + DAY_MS,
    start: String(start),
    startMs,
  };
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function knownFees(position: SlowTradingFinancePosition): number {
  const entry = finiteNumber(position.fees?.entryUsdt);
  const exit = finiteNumber(position.closed?.feeUsdt);

  return Math.max(0, entry ?? 0) + Math.max(0, exit ?? 0);
}

/** Aggregates persisted closed-position net P&L without using balance changes or open positions. */
function createSummary(params: {
  end: string;
  generatedAt?: Date;
  instanceName: string;
  mode: SlowTradingMode;
  positions: readonly SlowTradingFinancePosition[];
  start: string;
}): SlowTradingFinanceSummary {
  const range = resolveRange(params.start, params.end);
  const daily = new Map<string, SlowTradingFinanceDailyPoint>();
  let closedTradeCount = 0;
  let flatTradeCount = 0;
  let grossLossUsdt = 0;
  let grossProfitUsdt = 0;
  let includedTradeCount = 0;
  let knownFeesUsdt = 0;
  let losingTradeCount = 0;
  let missingPnlTradeCount = 0;
  let realizedNetPnlUsdt = 0;
  let winningTradeCount = 0;

  for (const position of params.positions) {
    const closedAt = finiteNumber(position.closed?.t);
    if (closedAt === null || closedAt < range.startMs || closedAt >= range.endExclusiveMs) continue;

    closedTradeCount += 1;
    const netPnl = finiteNumber(position.pnl?.netUsdt);
    if (netPnl === null) {
      missingPnlTradeCount += 1;
      continue;
    }

    includedTradeCount += 1;
    const fees = knownFees(position);
    const date = new Date(closedAt).toISOString().slice(0, 10);
    const point = daily.get(date) ?? {
      closedTradeCount: 0,
      date,
      grossLossUsdt: 0,
      grossProfitUsdt: 0,
      knownFeesUsdt: 0,
      realizedNetPnlUsdt: 0,
    };

    point.closedTradeCount += 1;
    point.knownFeesUsdt += fees;
    point.realizedNetPnlUsdt += netPnl;
    knownFeesUsdt += fees;
    realizedNetPnlUsdt += netPnl;

    if (netPnl > 0) {
      grossProfitUsdt += netPnl;
      point.grossProfitUsdt += netPnl;
      winningTradeCount += 1;
    } else if (netPnl < 0) {
      const loss = Math.abs(netPnl);
      grossLossUsdt += loss;
      point.grossLossUsdt += loss;
      losingTradeCount += 1;
    } else {
      flatTradeCount += 1;
    }

    daily.set(date, point);
  }

  const status = missingPnlTradeCount > 0 ? "partial" : "ready";

  return {
    closedTradeCount,
    currency: "USDT",
    daily: [...daily.values()]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((point) => ({
        ...point,
        grossLossUsdt: roundUsdt(point.grossLossUsdt),
        grossProfitUsdt: roundUsdt(point.grossProfitUsdt),
        knownFeesUsdt: roundUsdt(point.knownFeesUsdt),
        realizedNetPnlUsdt: roundUsdt(point.realizedNetPnlUsdt),
      })),
    flatTradeCount,
    generatedAt: (params.generatedAt ?? new Date()).toISOString(),
    grossLossUsdt: roundUsdt(grossLossUsdt),
    grossProfitUsdt: roundUsdt(grossProfitUsdt),
    includedTradeCount,
    instanceName: params.instanceName,
    knownFeesUsdt: roundUsdt(knownFeesUsdt),
    losingTradeCount,
    message: status === "partial"
      ? `${missingPnlTradeCount} closed trade${missingPnlTradeCount === 1 ? "" : "s"} had no persisted net P&L and were excluded.`
      : null,
    missingPnlTradeCount,
    mode: params.mode,
    period: {
      days: range.days,
      end: range.end,
      start: range.start,
    },
    realizedNetPnlUsdt: roundUsdt(realizedNetPnlUsdt),
    status,
    winningTradeCount,
  };
}

const slowTradingFinanceSummary = {
  create: createSummary,
  range: {
    resolve: resolveRange,
  },
} as const;

export default slowTradingFinanceSummary;
