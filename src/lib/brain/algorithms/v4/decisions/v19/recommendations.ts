import type { IExchange } from "@/lib/exchange";
import type { EntryRecommendation } from "@lib/brain/algorithms/type-execute";
import { buildLatestKlineBySymbol } from "./latest-klines";
import {
  evaluateRecommendationsV19Sync,
  getRecommendationsV19Sync,
} from "./selection";
import {
  buildSpeedTierBySymbolFromCoinTags,
  getSpeedTier,
  getSpeedTierFromMap,
} from "./speed-tier";
import type { LatestKlineBySymbol, SpeedTierBySymbol } from "./types";
import { decisionEngineLevelConfig } from "./constants";

export {
  buildSpeedTierBySymbolFromCoinTags,
  getRecommendationsV19Sync,
  getSpeedTier,
  getSpeedTierFromMap,
};
export type { LatestKlineBySymbol, SpeedTierBySymbol };

export async function getRecommendationsV19({
  exchange,
  latestKlineBySymbol,
  marketType,
  minActionableAbsoluteLevel,
  ...params
}: Parameters<typeof getRecommendationsV19Sync>[0] & {
  exchange?: IExchange;
  marketType?: "SPOT" | "FUTURES";
}): Promise<EntryRecommendation[]> {
  const resolvedMinActionableAbsoluteLevel =
    decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(
      minActionableAbsoluteLevel,
    );
  const resolvedLatestKlineBySymbol =
    latestKlineBySymbol ??
    (exchange
      ? await buildLatestKlineBySymbol({
          exchange,
          marketType,
          minActionableAbsoluteLevel: resolvedMinActionableAbsoluteLevel,
          volatilityPointsMap: params.volatilityPointsMap,
        })
      : {});

  return getRecommendationsV19Sync({
    ...params,
    latestKlineBySymbol: resolvedLatestKlineBySymbol,
    minActionableAbsoluteLevel: resolvedMinActionableAbsoluteLevel,
  });
}

/** Builds the same v19 recommendation with per-candidate diagnostics. */
export async function evaluateRecommendationsV19({
  exchange,
  latestKlineBySymbol,
  marketType,
  minActionableAbsoluteLevel,
  ...params
}: Parameters<typeof evaluateRecommendationsV19Sync>[0] & {
  exchange?: IExchange;
  marketType?: "SPOT" | "FUTURES";
}) {
  const resolvedMinActionableAbsoluteLevel =
    decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(
      minActionableAbsoluteLevel,
    );
  const resolvedLatestKlineBySymbol =
    latestKlineBySymbol ??
    (exchange
      ? await buildLatestKlineBySymbol({
          exchange,
          marketType,
          minActionableAbsoluteLevel: resolvedMinActionableAbsoluteLevel,
          volatilityPointsMap: params.volatilityPointsMap,
        })
      : {});

  return evaluateRecommendationsV19Sync({
    ...params,
    latestKlineBySymbol: resolvedLatestKlineBySymbol,
    minActionableAbsoluteLevel: resolvedMinActionableAbsoluteLevel,
  });
}
