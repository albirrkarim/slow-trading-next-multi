import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import type {
  LevelBasedPctDriftStopLossCondition,
  LevelBasedPctDriftStopLossConfig,
  PositionDirection,
} from "@/lib/trading/models";

type VPointAnchor = {
  lvl: number;
  p: number;
};

/** Creates the disabled default configuration. */
function createDefaultConfig(): LevelBasedPctDriftStopLossConfig {
  return { enabled: false, conditions: [] };
}

/** Sanitizes persisted or user-edited exact-level drift conditions. */
function normalizeConfig(
  config?: LevelBasedPctDriftStopLossConfig,
): LevelBasedPctDriftStopLossConfig {
  if (!config) return createDefaultConfig();

  const conditions = new Map<number, LevelBasedPctDriftStopLossCondition>();
  for (const condition of Array.isArray(config.conditions)
    ? config.conditions
    : []) {
    const absoluteLevel = Math.floor(Math.abs(Number(condition.absoluteLevel)));
    if (!Number.isFinite(absoluteLevel) || absoluteLevel < 1) continue;

    const configuredPct = Number(condition.adverseDriftPct);
    conditions.set(absoluteLevel, {
      absoluteLevel,
      adverseDriftPct:
        Number.isFinite(configuredPct) && configuredPct > 0
          ? configuredPct
          : VOLATILITY_THRESHOLD,
    });
  }

  return {
    enabled: config.enabled === true,
    conditions: [...conditions.values()].sort(
      (left, right) => left.absoluteLevel - right.absoluteLevel,
    ),
  };
}

/** Selects only a condition whose level exactly matches the current vPoint. */
function getCondition(
  absoluteLevel: number,
  config?: LevelBasedPctDriftStopLossConfig,
) {
  const normalized = normalizeConfig(config);
  if (!normalized.enabled) return undefined;
  return normalized.conditions.find(
    (condition) => condition.absoluteLevel === Math.abs(absoluteLevel),
  );
}

/** Resolves the adverse trigger price from the selected vPoint anchor. */
function resolveTriggerPrice(
  anchorPrice: number,
  adverseDriftPct: number,
  direction: PositionDirection,
) {
  const multiplier = adverseDriftPct / 100;
  return direction === "SHORT"
    ? anchorPrice * (1 + multiplier)
    : anchorPrice * (1 - multiplier);
}

/** Evaluates the exact-level adverse drift stop against the current price. */
function evaluate({
  config,
  currentPrice,
  direction,
  vPoint,
}: {
  config?: LevelBasedPctDriftStopLossConfig;
  currentPrice: number;
  direction: PositionDirection;
  vPoint?: VPointAnchor | null;
}) {
  const condition = vPoint ? getCondition(vPoint.lvl, config) : undefined;
  const triggerPrice =
    condition && vPoint
      ? resolveTriggerPrice(
          vPoint.p,
          condition.adverseDriftPct,
          direction,
        )
      : null;
  const adverseDriftPct =
    vPoint && vPoint.p > 0
      ? direction === "SHORT"
        ? ((currentPrice - vPoint.p) / vPoint.p) * 100
        : ((vPoint.p - currentPrice) / vPoint.p) * 100
      : 0;

  // BOTH:LEVEL_BASED_PCT_DRIFT_STOP_LOSS
  return {
    adverseDriftPct,
    condition,
    shouldExit:
      Boolean(condition) &&
      Number.isFinite(currentPrice) &&
      adverseDriftPct >= (condition?.adverseDriftPct ?? Infinity),
    triggerPrice,
  };
}

const levelBasedPctDriftStopLoss = {
  condition: { get: getCondition },
  config: { createDefault: createDefaultConfig, normalize: normalizeConfig },
  evaluate,
  triggerPrice: { resolve: resolveTriggerPrice },
} as const;

export default levelBasedPctDriftStopLoss;
