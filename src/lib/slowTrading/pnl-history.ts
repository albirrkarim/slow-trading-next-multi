const MINUTE_MS = 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 60;

/** Normalizes the configured PnL-history bucket to whole positive minutes. */
function normalizeBucketMinutes(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INTERVAL_MINUTES;
  }

  return Math.max(1, Math.floor(parsed));
}

/** Resolves the configured PnL-history bucket to milliseconds. */
function resolveBucketMs(value: unknown): number {
  return normalizeBucketMinutes(value) * MINUTE_MS;
}

const slowTradingPnlHistory = {
  bucket: {
    defaultMinutes: DEFAULT_INTERVAL_MINUTES,
    normalizeMinutes: normalizeBucketMinutes,
    resolveMs: resolveBucketMs,
  },
} as const;

export default slowTradingPnlHistory;
