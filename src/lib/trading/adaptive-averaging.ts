import { VOLATILITY_THRESHOLD } from "@/lib/brain/constants";
import type { AdaptiveAveragingConfig } from "@/lib/dynamic/type-dynamic.d";

const DEFAULT_MAX_MULTIPLIER = 5;

/** Creates an independent adaptive averaging configuration. */
function createDefault(enabled = true): AdaptiveAveragingConfig {
  return {
    enabled,
    maxMultiplier: DEFAULT_MAX_MULTIPLIER,
    minProjectedProfitPct: Math.floor(VOLATILITY_THRESHOLD / 2),
  };
}

/** Sanitizes persisted or user-edited adaptive averaging configuration. */
function normalize(
  config?: Partial<AdaptiveAveragingConfig>,
  defaultEnabled = true,
): AdaptiveAveragingConfig {
  const defaults = createDefault(defaultEnabled);
  const maxMultiplier = Math.floor(Number(config?.maxMultiplier));
  const minProjectedProfitPct = Number(config?.minProjectedProfitPct);

  return {
    enabled: config?.enabled ?? defaults.enabled,
    maxMultiplier:
      Number.isFinite(maxMultiplier) && maxMultiplier >= 1
        ? maxMultiplier
        : defaults.maxMultiplier,
    minProjectedProfitPct:
      Number.isFinite(minProjectedProfitPct) && minProjectedProfitPct >= 0
        ? minProjectedProfitPct
        : defaults.minProjectedProfitPct,
  };
}

const adaptiveAveraging = {
  config: {
    createDefault,
    normalize,
  },
} as const;

export default adaptiveAveraging;
