export const DEFAULT_AUTO_ENTRY_DAILY_PNL_LIMIT_USDT = -50;

export interface DailyPnlLimitPosition {
  closed?: { t?: number };
  opened: { t: number };
  pnl: { netUsdt?: number };
}

export interface DailyPnlLimitEvaluation {
  day: string;
  pnlUsdt: number;
  reached: boolean;
  thresholdUsdt: number;
}

/** Normalizes the automatic-entry daily PnL stop as a non-positive USDT value. */
function normalizeThresholdUsdt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(0, parsed)
    : DEFAULT_AUTO_ENTRY_DAILY_PNL_LIMIT_USDT;
}

/** Resolves the current UTC day and its half-open timestamp range. */
function getCurrentUtcPeriod(currentTimeMs = Date.now()): {
  day: string;
  endTime: number;
  startTime: number;
} {
  const current = new Date(currentTimeMs);
  const startTime = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
  );

  return {
    day: new Date(startTime).toISOString().slice(0, 10),
    endTime: startTime + 24 * 60 * 60 * 1000,
    startTime,
  };
}

/** Sums net USDT PnL for trades assigned to one UTC day by closing time. */
function sumForUtcDay(
  positions: DailyPnlLimitPosition[],
  day: string,
): number {
  return positions.reduce((sum, position) => {
    const pnlUsdt = position.pnl.netUsdt;
    if (typeof pnlUsdt !== "number" || !Number.isFinite(pnlUsdt)) {
      return sum;
    }

    const assignedAt = position.closed?.t ?? position.opened.t;
    if (!Number.isFinite(assignedAt)) {
      return sum;
    }

    return new Date(assignedAt).toISOString().slice(0, 10) === day
      ? sum + pnlUsdt
      : sum;
  }, 0);
}

/** Calculates the current navbar-style daily USDT PnL and entry-stop state. */
function evaluate(params: {
  currentTimeMs?: number;
  positions: DailyPnlLimitPosition[];
  thresholdUsdt: unknown;
}): DailyPnlLimitEvaluation {
  const period = getCurrentUtcPeriod(params.currentTimeMs);
  const pnlUsdt = sumForUtcDay(params.positions, period.day);

  return evaluatePnl({
    currentTimeMs: params.currentTimeMs,
    pnlUsdt,
    thresholdUsdt: params.thresholdUsdt,
  });
}

/** Evaluates an already-summed current UTC-day PnL value. */
function evaluatePnl(params: {
  currentTimeMs?: number;
  pnlUsdt: number;
  thresholdUsdt: unknown;
}): DailyPnlLimitEvaluation {
  const period = getCurrentUtcPeriod(params.currentTimeMs);
  const thresholdUsdt = normalizeThresholdUsdt(params.thresholdUsdt);
  const pnlUsdt = Number.isFinite(params.pnlUsdt) ? params.pnlUsdt : 0;

  return {
    day: period.day,
    pnlUsdt,
    reached: pnlUsdt <= thresholdUsdt,
    thresholdUsdt,
  };
}

function formatSignedUsdt(value: number): string {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

/** Builds the role-independent diagnostic shown when the daily PnL stop is active. */
function describe(evaluation: DailyPnlLimitEvaluation): string {
  return (
    `Automatic entry is paused because navbar USD PnL ` +
    `${formatSignedUsdt(evaluation.pnlUsdt)} reached the configured daily stop ` +
    `${formatSignedUsdt(evaluation.thresholdUsdt)} for ${evaluation.day} UTC. ` +
    "Automatic entry resumes if the daily PnL rises above the threshold or when the UTC day resets."
  );
}

const slowTradingDailyPnlLimit = {
  config: {
    defaultThresholdUsdt: DEFAULT_AUTO_ENTRY_DAILY_PNL_LIMIT_USDT,
    normalizeThresholdUsdt,
  },
  guard: {
    describe,
    evaluate,
    evaluatePnl,
  },
  period: {
    getCurrentUtc: getCurrentUtcPeriod,
  },
  pnl: {
    sumForUtcDay,
  },
} as const;

export default slowTradingDailyPnlLimit;
export { slowTradingDailyPnlLimit };
