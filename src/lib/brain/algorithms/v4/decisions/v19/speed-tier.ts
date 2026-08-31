import coinTags from "@/lib/devBacktest/coins/tags";
import type { SpeedTier } from "./constants";
import type { SpeedTierBySymbol } from "./types";

export function getSpeedTier(symbol: string): SpeedTier {
  return getSpeedTierFromMap(symbol, {});
}

export function getSpeedTierFromMap(
  symbol: string,
  speedTierBySymbol: SpeedTierBySymbol,
): SpeedTier {
  // PROD:DECISION_V19_SPEED_TIER
  return speedTierBySymbol[symbol.trim().toUpperCase()] ?? 3;
}

function parseSpeedTierTag(tag: string): SpeedTier | null {
  const normalized = tag.trim().toLocaleLowerCase();
  const match =
    normalized.match(/^speed\s*tier\s*([123])$/) ??
    normalized.match(/^tier\s*([123])$/);

  if (!match) return null;

  const tier = Number(match[1]);
  if (tier === 1 || tier === 2 || tier === 3) return tier;

  return null;
}

/** Builds v19 Speed-tier lookup from persisted coin metadata tags. */
export function buildSpeedTierBySymbolFromCoinTags(
  coinTagMap: Record<string, string[]>,
): SpeedTierBySymbol {
  // PROD:DECISION_V19_SPEED_TIER
  const result: SpeedTierBySymbol = {};

  for (const [symbolInput, tags] of Object.entries(coinTagMap)) {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) continue;

    for (const tag of tags) {
      const speedTier = parseSpeedTierTag(tag);
      if (speedTier) {
        result[symbol] = speedTier;
        break;
      }
    }
  }

  return result;
}

export function buildSpeedTierBySymbolFromMetadata(): SpeedTierBySymbol {
  // PROD:DECISION_V19_SPEED_TIER
  return buildSpeedTierBySymbolFromCoinTags(coinTags.list().coinTags);
}
