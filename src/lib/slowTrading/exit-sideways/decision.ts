import type { EntryRecommendation } from "@/lib/brain";
import type { SpeedTier } from "@/lib/brain/algorithms/v4/decisions/v19/constants";
import {
  buildSpeedTierBySymbolFromMetadata,
  getSpeedTierFromMap,
} from "@/lib/brain/algorithms/v4/decisions/v19/speed-tier";
import type { SpeedTierBySymbol } from "@/lib/brain/algorithms/v4/decisions/v19/types";
import type { Position } from "@/lib/trading/models";

const SIDEWAYS_NET_PNL_THRESHOLD_PERCENT = 1;
const STRONG_CANDIDATE_LEVEL = 4;
const AGED_SIDEWAYS_HOLD_MS = 2 * 24 * 60 * 60 * 1_000;

export interface SidewaysExitPositionInput {
  netProfitPercent?: number;
  position: Position;
  symbol: string;
}

export interface SidewaysExitDecision {
  availableWorkers: number;
  candidate?: EntryRecommendation;
  candidateSpeedTier?: SpeedTier;
  position?: Position;
  positionSpeedTier?: SpeedTier;
  positionSymbol?: string;
  reason?: string;
  shouldExit: boolean;
  strongCandidateCount: number;
}

function normalizeSymbol(symbol: string | undefined): string {
  return String(symbol || "")
    .trim()
    .toUpperCase();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getAbsoluteLevel(signal: Pick<EntryRecommendation, "lvl">): number {
  return Math.abs(Number(signal.lvl) || 0);
}

/**
 * Finds one sideways open position to exit when faster strong candidates need
 * worker capacity. The same pure rule is used by production, backtest, and
 * tests so the behavior does not drift.
 */
export function decideSidewaysExitForStrongCandidates(params: {
  availableWorkers: number;
  candidateLateEntryPassedBySymbol?: Record<string, boolean>;
  currentTimeMs?: number;
  enabled?: boolean;
  entrySignals: EntryRecommendation[];
  agedSidewaysHoldMs?: number;
  openPositions: SidewaysExitPositionInput[];
  sidewaysThresholdPercent?: number;
  speedTierBySymbol?: SpeedTierBySymbol;
}): SidewaysExitDecision {
  // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
  const availableWorkers = Math.max(0, Math.floor(params.availableWorkers));
  if (params.enabled !== true) {
    return {
      availableWorkers,
      reason: "disabled",
      shouldExit: false,
      strongCandidateCount: 0,
    };
  }

  const speedTierBySymbol =
    params.speedTierBySymbol ?? buildSpeedTierBySymbolFromMetadata();
  const openSymbols = new Set(
    params.openPositions
      .map((item) => normalizeSymbol(item.symbol || item.position.symbol))
      .filter(Boolean),
  );
  const candidateLateEntryPassedBySymbol =
    params.candidateLateEntryPassedBySymbol ?? {};
  const levelFourCandidates = params.entrySignals
    .map((signal) => {
      const symbol = normalizeSymbol(signal.symbol);
      const speedTier = getSpeedTierFromMap(symbol, speedTierBySymbol);
      const lateEntryPassed = candidateLateEntryPassedBySymbol[symbol] !== false;

      return { lateEntryPassed, signal, speedTier, symbol };
    })
    .filter(
      (item) =>
        item.symbol &&
        !openSymbols.has(item.symbol) &&
        getAbsoluteLevel(item.signal) >= STRONG_CANDIDATE_LEVEL,
    )
    .sort((left, right) => {
      const byTier = left.speedTier - right.speedTier;
      if (byTier !== 0) return byTier;
      return getAbsoluteLevel(right.signal) - getAbsoluteLevel(left.signal);
    });
  const strongCandidates = levelFourCandidates.filter(
    (item) => item.speedTier <= 2,
  );

  if (strongCandidates.length === 0 && levelFourCandidates.length === 0) {
    return {
      availableWorkers,
      reason: "no strong candidate",
      shouldExit: false,
      strongCandidateCount: 0,
    };
  }

  const sidewaysThresholdPercent =
    params.sidewaysThresholdPercent ?? SIDEWAYS_NET_PNL_THRESHOLD_PERCENT;
  const enrichedPositions = params.openPositions
    .map((item) => {
      const symbol = normalizeSymbol(item.symbol || item.position.symbol);
      const speedTier = getSpeedTierFromMap(symbol, speedTierBySymbol);
      const netProfitPercent =
        item.netProfitPercent ?? item.position.pnl.netPct;
      return {
        ...item,
        netProfitPercent,
        speedTier,
        symbol,
      };
    })
    .filter(
      (item) =>
        item.symbol &&
        isFiniteNumber(item.netProfitPercent) &&
        Math.abs(item.netProfitPercent) < sidewaysThresholdPercent,
    );

  const bestCandidate = strongCandidates[0];
  const eligiblePositions =
    bestCandidate && availableWorkers < strongCandidates.length
      ? enrichedPositions
        .filter((item) => item.speedTier > bestCandidate.speedTier)
        .sort((left, right) => {
          const byTier = right.speedTier - left.speedTier;
          if (byTier !== 0) return byTier;
          return (
            Math.abs(left.netProfitPercent ?? 0) -
            Math.abs(right.netProfitPercent ?? 0)
          );
        })
      : [];

  const target = eligiblePositions[0];
  if (target && bestCandidate) {
    return {
      availableWorkers,
      candidate: bestCandidate.signal,
      candidateSpeedTier: bestCandidate.speedTier,
      position: target.position,
      positionSpeedTier: target.speedTier,
      positionSymbol: target.symbol,
      reason:
        `free worker for ${bestCandidate.symbol} speed tier ` +
        `${bestCandidate.speedTier} level ${bestCandidate.signal.lvl}`,
      shouldExit: true,
      strongCandidateCount: strongCandidates.length,
    };
  }

  const agedSidewaysHoldMs =
    params.agedSidewaysHoldMs ?? AGED_SIDEWAYS_HOLD_MS;
  const currentTimeMs = params.currentTimeMs;
  const agedCandidates = levelFourCandidates.filter(
    (item) => item.lateEntryPassed,
  );
  const agedTarget = isFiniteNumber(currentTimeMs)
    ? enrichedPositions
      .map((item) => {
        const entryTime = item.position.opened.t;
        const holdMs = isFiniteNumber(entryTime)
          ? currentTimeMs - entryTime
          : Number.NaN;
        const candidate = agedCandidates.find(
          (candidateItem) => candidateItem.speedTier <= item.speedTier,
        );

        return { ...item, candidate, holdMs };
      })
      .filter(
        (item) =>
          item.candidate &&
          isFiniteNumber(item.holdMs) &&
          item.holdMs >= agedSidewaysHoldMs,
      )
      .sort((left, right) => {
        const leftCandidateTier = left.candidate?.speedTier ?? 3;
        const rightCandidateTier = right.candidate?.speedTier ?? 3;
        const byCandidateTier = leftCandidateTier - rightCandidateTier;
        if (byCandidateTier !== 0) return byCandidateTier;

        const byHoldTime = right.holdMs - left.holdMs;
        if (byHoldTime !== 0) return byHoldTime;

        return (
          Math.abs(left.netProfitPercent ?? 0) -
          Math.abs(right.netProfitPercent ?? 0)
        );
      })[0]
    : undefined;

  if (agedTarget?.candidate) {
    return {
      availableWorkers,
      candidate: agedTarget.candidate.signal,
      candidateSpeedTier: agedTarget.candidate.speedTier,
      position: agedTarget.position,
      positionSpeedTier: agedTarget.speedTier,
      positionSymbol: agedTarget.symbol,
      reason:
        `exit aged sideways position held ${Math.floor(
          agedTarget.holdMs / (24 * 60 * 60 * 1_000),
        )}d for ${agedTarget.candidate.symbol} speed tier ` +
        `${agedTarget.candidate.speedTier} level ` +
        `${agedTarget.candidate.signal.lvl}`,
      shouldExit: true,
      strongCandidateCount: strongCandidates.length,
    };
  }

  if (bestCandidate && availableWorkers >= strongCandidates.length) {
    return {
      availableWorkers,
      candidate: bestCandidate.signal,
      candidateSpeedTier: bestCandidate.speedTier,
      reason: "workers available",
      shouldExit: false,
      strongCandidateCount: strongCandidates.length,
    };
  }

  return {
    availableWorkers,
    candidate: bestCandidate?.signal ?? levelFourCandidates[0]?.signal,
    candidateSpeedTier:
      bestCandidate?.speedTier ?? levelFourCandidates[0]?.speedTier,
    reason:
      bestCandidate && availableWorkers < strongCandidates.length
        ? "no slower sideways position"
        : "no slower or aged sideways position",
    shouldExit: false,
    strongCandidateCount: strongCandidates.length,
  };
}
