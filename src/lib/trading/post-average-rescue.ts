import type {
  Position,
  PostAverageRescueExitConfig,
  PostAverageRescueExitThreshold,
} from "@/lib/trading/models";
import { VOLATILITY_THRESHOLD } from "../brain/constants";

const DEFAULT_THRESHOLDS: readonly PostAverageRescueExitThreshold[] = [
  { minAveragingCount: 1, minNetPnlPct: 0.5 },
  { minAveragingCount: 2, minNetPnlPct: 0 },
  { minAveragingCount: 3, minNetPnlPct: -0.5 },
];

type RescuePosition = Pick<Position, "strategy">;

/** Counts completed averaging fills, with USED steps as legacy fallback. */
function getCompletedAveragingCount(position?: RescuePosition | null): number {
  const averaging = position?.strategy.averaging;
  if (!averaging) {
    return 0;
  }

  const executionCount = Array.isArray(averaging.executions)
    ? averaging.executions.length
    : 0;
  const usedStepCount = Array.isArray(averaging.steps)
    ? averaging.steps.filter((step) => step.status === "USED").length
    : 0;

  return Math.max(executionCount, usedStepCount);
}

/** Creates an independent default post-average rescue configuration. */
function createDefaultConfig(): PostAverageRescueExitConfig {
  return {
    enabled: true,
    thresholds: DEFAULT_THRESHOLDS.map((threshold) => ({ ...threshold })),
  };
}

/** Sanitizes persisted or user-edited post-average rescue configuration. */
function normalizeConfig(
  config?: PostAverageRescueExitConfig,
): PostAverageRescueExitConfig {
  if (!config) {
    return createDefaultConfig();
  }

  const thresholds = new Map<number, PostAverageRescueExitThreshold>();
  const configuredThresholds = Array.isArray(config.thresholds)
    ? config.thresholds
    : [];
  for (const threshold of configuredThresholds) {
    const minAveragingCount = Math.max(
      1,
      Math.floor(Number(threshold.minAveragingCount)),
    );
    const minNetPnlPct = Number(threshold.minNetPnlPct);
    if (Number.isFinite(minAveragingCount) && Number.isFinite(minNetPnlPct)) {
      thresholds.set(minAveragingCount, {
        minAveragingCount,
        minNetPnlPct,
      });
    }
  }

  return {
    enabled: config.enabled !== false,
    thresholds: [...thresholds.values()].sort(
      (left, right) => left.minAveragingCount - right.minAveragingCount,
    ),
  };
}

/** Resolves the minimum net PnL for the completed averaging count. */
function getMinimumNetPnlPercent(
  completedAveragingCount: number,
  config?: PostAverageRescueExitConfig,
): number | undefined {
  const resolvedConfig = config ?? {
    enabled: true,
    thresholds: DEFAULT_THRESHOLDS,
  };
  if (!resolvedConfig.enabled) {
    return undefined;
  }

  let selected: PostAverageRescueExitThreshold | undefined;
  const thresholds = Array.isArray(resolvedConfig.thresholds)
    ? resolvedConfig.thresholds
    : [];
  for (const threshold of thresholds) {
    if (
      Number.isFinite(threshold.minAveragingCount) &&
      Number.isFinite(threshold.minNetPnlPct) &&
      threshold.minAveragingCount <= completedAveragingCount &&
      (!selected || threshold.minAveragingCount > selected.minAveragingCount)
    ) {
      selected = threshold;
    }
  }

  return selected?.minNetPnlPct;
}

/** Calculates favorable price distance from the latest vPoint. */
function calculateFavorableDistancePercent({
  currentPrice,
  direction,
  lastVolatilityPrice,
}: {
  currentPrice: number;
  direction?: Position["direction"];
  lastVolatilityPrice?: number;
}) {
  if (
    !(
      typeof currentPrice === "number" &&
      Number.isFinite(currentPrice) &&
      currentPrice > 0
    ) ||
    !(
      typeof lastVolatilityPrice === "number" &&
      Number.isFinite(lastVolatilityPrice) &&
      lastVolatilityPrice > 0
    )
  ) {
    return 0;
  }

  if (direction === "SHORT") {
    return ((lastVolatilityPrice - currentPrice) / lastVolatilityPrice) * 100;
  }

  return ((currentPrice - lastVolatilityPrice) / lastVolatilityPrice) * 100;
}

/** Evaluates the tiered post-average rescue exit against current net PnL. */
function evaluate({
  currentPrice,
  direction,
  lastVolatilityPrice,
  netPnlPercent,
  position,
  config,
}: {
  currentPrice: number;
  direction?: Position["direction"];
  lastVolatilityPrice?: number;
  netPnlPercent: number;
  position?: RescuePosition | null;
  config?: PostAverageRescueExitConfig;
}) {
  // BOTH:POST_AVERAGE_RESCUE_EXIT
  const completedAveragingCount = getCompletedAveragingCount(position);
  const minimumNetPnlPercent = getMinimumNetPnlPercent(
    completedAveragingCount,
    config,
  );
  const favorableDistancePercent = calculateFavorableDistancePercent({
    currentPrice,
    direction,
    lastVolatilityPrice,
  });
  const hasRequiredNetPnl =
    minimumNetPnlPercent !== undefined && netPnlPercent >= minimumNetPnlPercent;

  return {
    completedAveragingCount,
    favorableDistancePercent,
    minimumNetPnlPercent,
    shouldExit:
      favorableDistancePercent >= VOLATILITY_THRESHOLD && hasRequiredNetPnl,
  };
}

const postAverageRescue = {
  averaging: {
    countCompleted: getCompletedAveragingCount,
  },
  config: {
    createDefault: createDefaultConfig,
    normalize: normalizeConfig,
  },
  distance: {
    calculateFavorablePercent: calculateFavorableDistancePercent,
  },
  evaluate,
  pnl: {
    getMinimumPercent: getMinimumNetPnlPercent,
  },
} as const;

export default postAverageRescue;
