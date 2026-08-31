import type {
  Position,
  PostAverageStopLossConfig,
  PostAverageStopLossThreshold,
} from "@/lib/trading/models";
import postAverageRescue from "./post-average-rescue";

const DEFAULT_THRESHOLDS: readonly PostAverageStopLossThreshold[] = [
  { maxNetPnlPct: 0, maxNetPnlUsdt: 0, minAveragingCount: 1 },
];

type AveragedPosition = Pick<Position, "strategy">;

/** Creates a disabled, independently mutable default configuration. */
function createDefaultConfig(): PostAverageStopLossConfig {
  return {
    enabled: false,
    thresholds: DEFAULT_THRESHOLDS.map((threshold) => ({ ...threshold })),
  };
}

function normalizeLossBoundary(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(0, numericValue) : 0;
}

/** Sanitizes persisted or user-edited post-average stop loss configuration. */
function normalizeConfig(
  config?: PostAverageStopLossConfig,
): PostAverageStopLossConfig {
  if (!config) return createDefaultConfig();

  const thresholds = new Map<number, PostAverageStopLossThreshold>();
  for (const threshold of Array.isArray(config.thresholds)
    ? config.thresholds
    : []) {
    const minAveragingCount = Math.max(
      1,
      Math.floor(Number(threshold.minAveragingCount)),
    );
    if (!Number.isFinite(minAveragingCount)) continue;

    thresholds.set(minAveragingCount, {
      maxNetPnlPct: normalizeLossBoundary(threshold.maxNetPnlPct),
      maxNetPnlUsdt: normalizeLossBoundary(threshold.maxNetPnlUsdt),
      minAveragingCount,
    });
  }

  return {
    enabled: config.enabled === true,
    thresholds: [...thresholds.values()].sort(
      (left, right) => left.minAveragingCount - right.minAveragingCount,
    ),
  };
}

/** Selects the greatest configured averaging tier already reached. */
function getThreshold(
  completedAveragingCount: number,
  config?: PostAverageStopLossConfig,
): PostAverageStopLossThreshold | undefined {
  const resolvedConfig = normalizeConfig(config);
  if (!resolvedConfig.enabled) return undefined;

  let selected: PostAverageStopLossThreshold | undefined;
  for (const threshold of resolvedConfig.thresholds) {
    if (threshold.minAveragingCount <= completedAveragingCount) {
      selected = threshold;
    }
  }
  return selected;
}

/** Evaluates independent fee-aware percent and USDT loss boundaries. */
function evaluate({
  config,
  netPnlPercent,
  netPnlUsdt,
  position,
}: {
  config?: PostAverageStopLossConfig;
  netPnlPercent: number;
  netPnlUsdt: number;
  position?: AveragedPosition | null;
}) {
  const completedAveragingCount =
    postAverageRescue.averaging.countCompleted(position);
  const threshold = getThreshold(completedAveragingCount, config);
  const percentEnabled = (threshold?.maxNetPnlPct ?? 0) < 0;
  const usdtEnabled = (threshold?.maxNetPnlUsdt ?? 0) < 0;
  const hitPercent =
    percentEnabled && netPnlPercent <= (threshold?.maxNetPnlPct ?? 0);
  const hitUsdt = usdtEnabled && netPnlUsdt <= (threshold?.maxNetPnlUsdt ?? 0);

  return {
    completedAveragingCount,
    hitPercent,
    hitUsdt,
    shouldExit: hitPercent || hitUsdt,
    threshold,
  };
}

const postAverageStopLoss = {
  config: {
    createDefault: createDefaultConfig,
    normalize: normalizeConfig,
  },
  evaluate,
  threshold: {
    get: getThreshold,
  },
} as const;

export default postAverageStopLoss;
