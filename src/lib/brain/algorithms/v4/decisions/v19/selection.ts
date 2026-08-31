import { deepCopy } from "@/components/client/utils";
import type { PriceNorm } from "@/lib/dynamic";
import { tradeLog } from "@/lib/trading";
import type { TradingModelMemory } from "@/lib/trading/models";
import type { EntryRecommendation } from "@lib/brain/algorithms/type-execute";
import type { VolatilityPoint } from "@lib/dynamic/utils/volatility";
import {
  DECISION_V19_HOUR_MS,
  DECISION_V19_SPEED_TIER_CONFIG,
  decisionEngineLevelConfig,
} from "./constants";
import { projectNextLevelFromLatestKline } from "./projection";
import {
  buildSpeedTierBySymbolFromMetadata,
  getSpeedTierFromMap,
} from "./speed-tier";
import type {
  LatestKlineBySymbol,
  SpeedTierBySymbol,
  V19EntryDiagnostic,
  V19SelectionResult,
  V19TimingCandidate,
} from "./types";
import { getFeatures } from "../v17/feature";
import { classifier } from "../v18/classifier";
import { mapScaleValue } from "../v18/decision";

function buildTimingCandidate({
  currentPoint,
  latestKline,
  minActionableAbsoluteLevel,
  speedTierBySymbol,
  symbol,
}: {
  currentPoint: VolatilityPoint;
  latestKline: LatestKlineBySymbol[string];
  minActionableAbsoluteLevel: number;
  speedTierBySymbol: SpeedTierBySymbol;
  symbol: string;
}): V19TimingCandidate | null {
  const speedTier = getSpeedTierFromMap(symbol, speedTierBySymbol);
  const tierConfig = DECISION_V19_SPEED_TIER_CONFIG[speedTier];
  const absoluteLevel = Math.abs(currentPoint.lvl);

  // PROD:DECISION_V19_LEVEL_GATE
  // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
  // Current abs(level) at or above the configured threshold is actionable now.
  if (absoluteLevel >= minActionableAbsoluteLevel) {
    const estimatedEntryAt = currentPoint.t;

    // PROD:DECISION_V19_EXIT_ESTIMATION
    return {
      estimatedEntryAt,
      estimatedExitAt: estimatedEntryAt + tierConfig.avgHoldMs,
      pctLikelynessToNextLevel: 100,
      projected: false,
      speedTier,
      transitionMs: 0,
      volatilityPoint: currentPoint,
    };
  }

  // PROD:DECISION_V19_LEVEL_GATE
  // The level immediately below the configured threshold can only be used as
  // a wait candidate. It can never become an immediate entry in this cycle.
  if (absoluteLevel !== minActionableAbsoluteLevel - 1) {
    return null;
  }

  // PROD:DECISION_V19_DIRECTION_CHECK
  // Use the latest kline close to check whether price is still
  // moving toward the next level. A positive level needs price to move up
  // again; a negative level needs price to move down again.
  const projection = projectNextLevelFromLatestKline({
    currentPoint,
    latestKline,
  });
  if (!projection || projection.transitionMs > tierConfig.transitionMaxMs) {
    return null;
  }

  // PROD:DECISION_V19_EXIT_ESTIMATION
  // Project when this coin should reach the configured entry level, then add
  // the tier's average hold duration to estimate the exit time.
  const estimatedEntryAt = projection.estimatedEntryAt;

  return {
    estimatedEntryAt,
    estimatedExitAt: estimatedEntryAt + tierConfig.avgHoldMs,
    pctLikelynessToNextLevel: projection.pctLikelynessToNextLevel,
    projected: true,
    speedTier,
    transitionMs: projection.transitionMs,
    volatilityPoint: currentPoint,
  };
}

function makeEntryRecommendation(candidate: V19TimingCandidate) {
  const e = candidate.volatilityPoint;
  let amountProbab = 0;

  if (e.l == "B") {
    amountProbab = mapScaleValue(-1, -5, e.lvl, 0.5, e.probability ?? 1);
  }

  if (e.l == "T") {
    amountProbab = mapScaleValue(1, 5, e.lvl, 0.5, e.probability ?? 1);
  }

  const direction = e.l == "B" ? "LONG" : "SHORT";

  return {
    ...e,
    amountProbab,
    message: `decision.v19 ${direction}: speed tier ${candidate.speedTier}, estimated exit ${Math.round(
      (candidate.estimatedExitAt - candidate.estimatedEntryAt) /
        DECISION_V19_HOUR_MS,
    )}h after entry`,
    maxLeverage: 3,
  } satisfies EntryRecommendation;
}

/** Evaluates v19 recommendations and explains every actionable candidate. */
export function evaluateRecommendationsV19Sync({
  volatilityPointsMap,
  priceNormMapOverTime,
  modelMemoryMap,
  latestKlineBySymbol = {},
  minActionableAbsoluteLevel,
  speedTierBySymbol,
  bypass = false,
}: {
  volatilityPointsMap: Record<string, VolatilityPoint[]>;
  priceNormMapOverTime: Record<string, PriceNorm[]>;
  modelMemoryMap: Record<string, TradingModelMemory>;
  latestKlineBySymbol?: LatestKlineBySymbol;
  minActionableAbsoluteLevel?: number;
  speedTierBySymbol?: SpeedTierBySymbol;
  bypass?: boolean;
}): V19SelectionResult {
  const timingCandidates: V19TimingCandidate[] = [];
  const diagnosticsBySymbol = new Map<string, V19EntryDiagnostic>();
  const resolvedSpeedTierBySymbol =
    speedTierBySymbol ?? buildSpeedTierBySymbolFromMetadata();
  const resolvedMinActionableAbsoluteLevel =
    decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(
      minActionableAbsoluteLevel,
    );
  const btcPriceNorm = priceNormMapOverTime["BTC"]?.at(-1);

  if (!bypass && !btcPriceNorm) {
    tradeLog.error("btcPriceNorm not found");
    for (const [symbol, points] of Object.entries(volatilityPointsMap)) {
      const currentPoint = points.at(-1);
      if (
        symbol !== "BTC" &&
        currentPoint &&
        decisionEngineLevelConfig.isActionableLevel(
          currentPoint,
          resolvedMinActionableAbsoluteLevel,
        )
      ) {
        diagnosticsBySymbol.set(symbol, {
          code: "MISSING_BTC_PRICE_NORM",
          level: currentPoint.lvl,
          pointId: currentPoint.id,
          reason:
            "Blocked because BTC price-normalization context is unavailable.",
          status: "blocked",
          symbol,
        });
      }
    }
    return {
      diagnostics: [...diagnosticsBySymbol.values()],
      recommendations: [],
    };
  }

  for (const symbol of Object.keys(volatilityPointsMap)) {
    if (symbol === "BTC") {
      const currentPoint = volatilityPointsMap[symbol].at(-1);
      if (
        currentPoint &&
        decisionEngineLevelConfig.isActionableLevel(
          currentPoint,
          resolvedMinActionableAbsoluteLevel,
        )
      ) {
        diagnosticsBySymbol.set(symbol, {
          code: "BTC_CONTEXT_ONLY",
          level: currentPoint.lvl,
          pointId: currentPoint.id,
          reason:
            "Blocked because BTC is used as market context and is not an entry candidate.",
          status: "blocked",
          symbol,
        });
      }
      continue;
    }

    for (const volatility of volatilityPointsMap[symbol]) {
      volatility.symbol = symbol;
    }

    const currentPoint = volatilityPointsMap[symbol].at(-1);
    const previousPoint = volatilityPointsMap[symbol].at(-2);

    if (!currentPoint || currentPoint.lvl === 0) {
      continue;
    }

    const actionable = decisionEngineLevelConfig.isActionableLevel(
      currentPoint,
      resolvedMinActionableAbsoluteLevel,
    );

    if (currentPoint.used) {
      if (actionable) {
        diagnosticsBySymbol.set(symbol, {
          code: "USED_VOLATILITY_POINT",
          level: currentPoint.lvl,
          pointId: currentPoint.id,
          reason: "Blocked because this volatility point was already used.",
          status: "blocked",
          symbol,
        });
      }
      continue;
    }

    if (previousPoint) {
      currentPoint.delta = currentPoint.t - previousPoint.t;
    }

    const candidate = buildTimingCandidate({
      currentPoint,
      latestKline: latestKlineBySymbol[symbol],
      minActionableAbsoluteLevel: resolvedMinActionableAbsoluteLevel,
      speedTierBySymbol: resolvedSpeedTierBySymbol,
      symbol,
    });

    if (!candidate) {
      continue;
    }

    // PROD:DECISION_V19_LEVEL_GATE
    // Only immediate candidates at the configured level pass through the
    // normal classifier. Projected candidates are wait signals and never
    // entry recommendations.
    if (!bypass && !candidate.projected && btcPriceNorm) {
      const feature = getFeatures({
        currentPoint,
        btcPriceNorm,
        priceNormMapOverTime,
        volatilityPointsMap,
        modelMemoryMap,
      });

      currentPoint.feature = deepCopy(feature);

      const result = classifier(
        currentPoint,
        feature,
        resolvedMinActionableAbsoluteLevel,
      );
      if (!result.entry) {
        diagnosticsBySymbol.set(symbol, {
          code: "CLASSIFIER_REJECTED",
          level: currentPoint.lvl,
          pointId: currentPoint.id,
          reason:
            result.reasons.filter(Boolean).join("; ") ||
            "Blocked by the decision classifier.",
          status: "blocked",
          symbol,
        });
        continue;
      }

      currentPoint.probability = result.probability;
      currentPoint.descisionLabel = result.label;
    }

    timingCandidates.push(candidate);
  }

  if (timingCandidates.length === 0) {
    return {
      diagnostics: [...diagnosticsBySymbol.values()],
      recommendations: [],
    };
  }

  const sortedCandidates = timingCandidates.sort((left, right) => {
    const byExit = left.estimatedExitAt - right.estimatedExitAt;
    if (byExit !== 0) return byExit;
    return (
      Math.abs(right.volatilityPoint.lvl) - Math.abs(left.volatilityPoint.lvl)
    );
  });
  const bestCandidate = sortedCandidates[0];

  // PROD:DECISION_V19_WAIT_OR_ENTER
  // If the fastest estimated exit belongs to a projection, do nothing this
  // cycle. The next cycle can enter only after that coin really reaches the
  // configured absolute level.
  if (bestCandidate.projected) {
    const projectedSymbol =
      bestCandidate.volatilityPoint.symbol ?? "projected candidate";
    for (const candidate of sortedCandidates) {
      if (candidate.projected) continue;
      const point = candidate.volatilityPoint;
      const symbol = point.symbol ?? "";
      diagnosticsBySymbol.set(symbol, {
        code: "WAITING_FOR_PROJECTION",
        level: point.lvl,
        pointId: point.id,
        reason:
          `Waiting for ${projectedSymbol} to reach Level ` +
          `${Math.sign(bestCandidate.volatilityPoint.lvl) * resolvedMinActionableAbsoluteLevel}; ` +
          "v19 estimates that candidate will exit sooner.",
        status: "blocked",
        symbol,
      });
    }
    return {
      diagnostics: [...diagnosticsBySymbol.values()],
      recommendations: [],
    };
  }

  bestCandidate.volatilityPoint.used = true;

  // PROD:DECISION_V19_WAIT_OR_ENTER
  // Return only the best immediate candidate, because v19 optimizes for
  // the fastest estimated exit timing rather than opening every eligible coin.
  const selectedSymbol = bestCandidate.volatilityPoint.symbol ?? "";
  for (const candidate of sortedCandidates) {
    if (candidate.projected) continue;
    const point = candidate.volatilityPoint;
    const symbol = point.symbol ?? "";
    const selected = candidate === bestCandidate;
    diagnosticsBySymbol.set(symbol, {
      code: selected ? "READY" : "FASTER_CANDIDATE_SELECTED",
      level: point.lvl,
      pointId: point.id,
      reason: selected
        ? "Ready: selected by decision.v19 as the fastest estimated exit."
        : `Blocked because decision.v19 selected ${selectedSymbol}, which has a faster estimated exit.`,
      status: selected ? "ready" : "blocked",
      symbol,
    });
  }

  return {
    diagnostics: [...diagnosticsBySymbol.values()],
    recommendations: [makeEntryRecommendation(bestCandidate)],
  };
}

export function getRecommendationsV19Sync(
  params: Parameters<typeof evaluateRecommendationsV19Sync>[0],
): EntryRecommendation[] {
  return evaluateRecommendationsV19Sync(params).recommendations;
}
