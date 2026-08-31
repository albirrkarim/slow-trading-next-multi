export interface SlowTradingDailyPerformanceTrade {
  entryTime: number;
  exitTime?: number;
  netPnlPct?: number;
  netProfitUSDT?: number;
}

export interface SlowTradingDailyPerformanceBalanceSnapshot {
  day: string;
  timestamp: number;
  total: number;
}

export interface SlowTradingDailyTradeMetrics {
  losingPnlUsdt: number;
  losses: number;
  pnlPercent: number;
  pnlUsdt: number;
  trades: number;
  winRate: number;
  winningPnlUsdt: number;
  wins: number;
}

export interface SlowTradingDailyBalanceMetrics {
  endBalance: number | null;
  pnlPercentOfStart: number | null;
  pnlUsdt: number | null;
  startBalance: number | null;
}

export interface SlowTradingDailyPerformanceReport {
  balance: SlowTradingDailyBalanceMetrics;
  day: string;
  dayEndMs: number;
  dayStartMs: number;
  trades: SlowTradingDailyTradeMetrics;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Resolves the most recently completed UTC day for a timestamp. */
function getPreviousCompletedUtcDay(currentTimeMs = Date.now()): {
  day: string;
  dayEndMs: number;
  dayStartMs: number;
} {
  const current = new Date(currentTimeMs);
  const dayEndMs = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
  );
  const dayStartMs = dayEndMs - 24 * 60 * 60 * 1000;

  return {
    day: new Date(dayStartMs).toISOString().slice(0, 10),
    dayEndMs,
    dayStartMs,
  };
}

/** Groups closed-trade metrics by UTC day using the calendar card rules. */
function summarizeTradesByUtcDay(
  history: SlowTradingDailyPerformanceTrade[],
): Map<string, SlowTradingDailyTradeMetrics> {
  const byDay = new Map<string, SlowTradingDailyTradeMetrics>();

  for (const item of [...history].sort(
    (left, right) => (left.exitTime ?? 0) - (right.exitTime ?? 0),
  )) {
    const closedAt = item.exitTime ?? item.entryTime;
    if (!isFiniteNumber(closedAt) || closedAt <= 0) {
      continue;
    }

    const day = new Date(closedAt).toISOString().slice(0, 10);
    const pnlUsdt = isFiniteNumber(item.netProfitUSDT)
      ? item.netProfitUSDT
      : 0;
    const pnlPercent = isFiniteNumber(item.netPnlPct) ? item.netPnlPct : 0;
    const outcomePnl = isFiniteNumber(item.netProfitUSDT)
      ? item.netProfitUSDT
      : pnlPercent;
    const current = byDay.get(day) ?? {
      losingPnlUsdt: 0,
      losses: 0,
      pnlPercent: 0,
      pnlUsdt: 0,
      trades: 0,
      winRate: 0,
      winningPnlUsdt: 0,
      wins: 0,
    };

    // BOTH:DAILY_TRADE_METRICS
    current.pnlPercent += pnlPercent;
    current.pnlUsdt += pnlUsdt;
    current.winningPnlUsdt += Math.max(0, pnlUsdt);
    current.losingPnlUsdt += Math.min(0, pnlUsdt);
    current.trades += 1;
    current.wins += outcomePnl > 0 ? 1 : 0;
    current.losses += outcomePnl <= 0 ? 1 : 0;
    current.winRate = (current.wins / current.trades) * 100;
    byDay.set(day, current);
  }

  return byDay;
}

/** Calculates one UTC day's balance movement using the latest earlier snapshot. */
function summarizeBalance(params: {
  balanceSnapshots: SlowTradingDailyPerformanceBalanceSnapshot[];
  day: string;
  startingBalanceUSDT?: number;
}): SlowTradingDailyBalanceMetrics {
  const snapshots = params.balanceSnapshots
    .filter(
      (snapshot) =>
        typeof snapshot.day === "string" && isFiniteNumber(snapshot.total),
    )
    .sort((left, right) => left.day.localeCompare(right.day));
  const endBalance =
    snapshots.find((snapshot) => snapshot.day === params.day)?.total ?? null;
  const previousEndBalance = [...snapshots]
    .reverse()
    .find((snapshot) => snapshot.day < params.day)?.total;
  const startBalance = isFiniteNumber(previousEndBalance)
    ? previousEndBalance
    : isFiniteNumber(params.startingBalanceUSDT)
      ? params.startingBalanceUSDT
      : endBalance;
  const pnlUsdt =
    endBalance !== null && startBalance !== null
      ? endBalance - startBalance
      : null;
  const pnlPercentOfStart =
    pnlUsdt !== null &&
    startBalance !== null &&
    Math.abs(startBalance) > 0.000001
      ? (pnlUsdt / startBalance) * 100
      : null;

  return {
    endBalance,
    pnlPercentOfStart,
    pnlUsdt,
    startBalance,
  };
}

/** Creates the completed UTC-day report shared by the calendar and notification. */
function createReport(params: {
  balanceSnapshots: SlowTradingDailyPerformanceBalanceSnapshot[];
  currentTimeMs?: number;
  history: SlowTradingDailyPerformanceTrade[];
  startingBalanceUSDT?: number;
}): SlowTradingDailyPerformanceReport {
  const period = getPreviousCompletedUtcDay(params.currentTimeMs);
  const trades = summarizeTradesByUtcDay(params.history).get(period.day) ?? {
    losingPnlUsdt: 0,
    losses: 0,
    pnlPercent: 0,
    pnlUsdt: 0,
    trades: 0,
    winRate: 0,
    winningPnlUsdt: 0,
    wins: 0,
  };

  return {
    ...period,
    balance: summarizeBalance({
      balanceSnapshots: params.balanceSnapshots,
      day: period.day,
      startingBalanceUSDT: params.startingBalanceUSDT,
    }),
    trades,
  };
}

const slowTradingDailyPerformance = {
  balance: {
    summarize: summarizeBalance,
  },
  report: {
    create: createReport,
    getPreviousCompletedUtcDay,
  },
  trades: {
    summarizeByUtcDay: summarizeTradesByUtcDay,
  },
} as const;

export default slowTradingDailyPerformance;
export { slowTradingDailyPerformance };
