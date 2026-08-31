const HOUR_MS = 60 * 60 * 1_000;
const DEFAULT_MIN_ACTIONABLE_ABSOLUTE_LEVEL = 2;
const MIN_ACTIONABLE_ABSOLUTE_LEVEL = 1;

export const DECISION_V19_HOUR_MS = HOUR_MS;
export const DECISION_V19_LATEST_KLINE_CONCURRENCY = 8;

export const decisionEngineLevelConfig = {
  defaultMinActionableAbsoluteLevel: DEFAULT_MIN_ACTIONABLE_ABSOLUTE_LEVEL,

  /**
   * Normalizes the configured absolute immediate-entry threshold.
   */
  resolveMinActionableAbsoluteLevel(value?: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_MIN_ACTIONABLE_ABSOLUTE_LEVEL;
    }

    return Math.max(MIN_ACTIONABLE_ABSOLUTE_LEVEL, Math.floor(value));
  },

  /**
   * Checks a vPoint against the configured immediate-entry threshold.
   */
  isActionableLevel(
    point: { lvl?: number },
    minActionableAbsoluteLevel?: number,
  ) {
    return (
      typeof point.lvl === "number" &&
      Number.isFinite(point.lvl) &&
      Math.abs(point.lvl) >=
        decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(
          minActionableAbsoluteLevel,
        )
    );
  },
};

export const DECISION_V19_SPEED_TIER_CONFIG = {
  1: {
    avgHoldMs: 24 * HOUR_MS,
    maxHoldMs: 96 * HOUR_MS,
    transitionMaxMs: 30 * HOUR_MS,
  },
  2: {
    avgHoldMs: 48 * HOUR_MS,
    maxHoldMs: 168 * HOUR_MS,
    transitionMaxMs: 30 * HOUR_MS,
  },
  3: {
    avgHoldMs: 72 * HOUR_MS,
    maxHoldMs: 336 * HOUR_MS,
    transitionMaxMs: 48 * HOUR_MS,
  },
} as const;

export type SpeedTier = keyof typeof DECISION_V19_SPEED_TIER_CONFIG;
