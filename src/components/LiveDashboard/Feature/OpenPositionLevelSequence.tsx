"use client";

import type { VolatilityPoint } from "@/lib/dynamic";
import lateEntryVPointDrift from "@/lib/trading/execute/late-entry-vpoint-drift";
import PositionLevelSequence, {
  type PositionLevelSequenceCoverage,
  type PositionLevelSequenceItem,
  type PositionLevelSequenceReserveStatus,
  type PositionLevelSequenceState,
} from "@/components/LiveDashboard/Shared/PositionLevelSequence";

type ReserveStepStatus = PositionLevelSequenceReserveStatus;

interface ReserveStep {
  level?: number;
  marginUsdt?: number;
  status?: ReserveStepStatus;
}

interface AveragingTrigger {
  allocationPct?: number;
  level?: number;
}

interface WatchState {
  executions?: AveragingTrigger[];
  steps: ReserveStep[];
}

export type OpenPositionLevelSequenceItem = PositionLevelSequenceItem;

interface BuildOpenPositionLevelSequenceParams {
  currentLevel?: number;
  direction?: "LONG" | "SHORT";
  entryLevel?: number;
  entryTime?: number;
  markPrice?: number;
  reserveMultiplier?: number;
  spendableQuoteAsset?: number;
  volatilityPoints?: VolatilityPoint[];
  watchState?: WatchState;
}

function finiteLevel(value?: number): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function levelKey(level: number): number {
  return Math.abs(level);
}

/**
 * Builds the observed level path after the volatility target zone breaks averaging.
 */
function getTargetHitSequence({
  averagingMultiplierByLevel,
  direction,
  entryLevel,
  entryTime,
  volatilityPoints,
  watchState,
}: {
  averagingMultiplierByLevel: Map<number, number | undefined>;
  direction?: "LONG" | "SHORT";
  entryLevel: number | null;
  entryTime?: number;
  volatilityPoints?: VolatilityPoint[];
  watchState?: WatchState;
}): OpenPositionLevelSequenceItem[] | null {
  if (
    entryLevel === null ||
    (direction !== "LONG" && direction !== "SHORT") ||
    typeof entryTime !== "number" ||
    !Number.isFinite(entryTime)
  ) {
    return null;
  }

  const targetLabel = direction === "LONG" ? "T" : "B";
  const adverseLabel = direction === "LONG" ? "B" : "T";
  const postEntryPoints = [...(volatilityPoints ?? [])]
    .filter((point) => point.t >= entryTime)
    .sort((a, b) => a.t - b.t);
  const targetPointIndex = postEntryPoints.findIndex(
    (point) => point.l === targetLabel,
  );

  if (targetPointIndex < 0) {
    return null;
  }

  const targetPoint = postEntryPoints[targetPointIndex];
  const reachedLevelKeys = new Set<number>();
  const reachedAdverseLevels = postEntryPoints
    .filter(
      (point) =>
        point.t <= targetPoint.t &&
        point.l === adverseLabel &&
        levelKey(point.lvl) > levelKey(entryLevel),
    )
    .filter((point) => {
      const key = levelKey(point.lvl);
      if (reachedLevelKeys.has(key)) {
        return false;
      }

      reachedLevelKeys.add(key);
      return true;
    });
  const reserveStepsByLevel = new Map(
    (watchState?.steps ?? [])
      .filter((step) => finiteLevel(step.level) !== null)
      .map((step) => [levelKey(step.level!), step]),
  );
  const postTargetPoints = postEntryPoints.slice(targetPointIndex + 1);
  const postTargetItems = postTargetPoints.map((point, index) => ({
    coveredMarginUsdt: 0,
    isAveraged: false,
    isEntry: false,
    level: point.lvl,
    state:
      index === postTargetPoints.length - 1
        ? ("current" as const)
        : ("passed" as const),
  }));

  return [
    {
      coveredMarginUsdt: 0,
      isAveraged: false,
      isEntry: true,
      level: entryLevel,
      state: "passed",
    },
    ...reachedAdverseLevels.map((point) => {
      const step = reserveStepsByLevel.get(levelKey(point.lvl));
      const isAveraged =
        step?.status === "USED" ||
        averagingMultiplierByLevel.has(levelKey(point.lvl));

      return {
        averagingMultiplier: averagingMultiplierByLevel.get(
          levelKey(point.lvl),
        ),
        coveredMarginUsdt: 0,
        isAveraged,
        isEntry: false,
        level: point.lvl,
        marginUsdt: step?.marginUsdt,
        reserveStatus: step?.status,
        state: isAveraged ? ("passed" as const) : ("skipped" as const),
      };
    }),
    {
      coveredMarginUsdt: 0,
      isAveraged: false,
      isEntry: false,
      level: 0,
      state: "target",
    },
    ...postTargetItems,
  ];
}

/**
 * Builds the displayed entry-to-averaging level ladder for an open position.
 */
export function buildOpenPositionLevelSequence({
  currentLevel,
  direction,
  entryLevel,
  entryTime,
  markPrice,
  spendableQuoteAsset,
  volatilityPoints,
  watchState,
}: BuildOpenPositionLevelSequenceParams): OpenPositionLevelSequenceItem[] {
  const normalizedEntryLevel = finiteLevel(entryLevel);
  const normalizedCurrentLevel = finiteLevel(currentLevel);
  const normalizedSpendableQuoteAsset =
    typeof spendableQuoteAsset === "number" &&
    Number.isFinite(spendableQuoteAsset) &&
    spendableQuoteAsset >= 0
      ? spendableQuoteAsset
      : null;
  const averagingMultiplierByLevel = new Map<number, number | undefined>();
  for (const execution of watchState?.executions ?? []) {
    const level = finiteLevel(execution.level);
    if (level !== null) {
      averagingMultiplierByLevel.set(
        levelKey(level),
        execution.allocationPct,
      );
    }
  }
  // BOTH:VOLATILITY_TARGET_TP
  const targetHitSequence = getTargetHitSequence({
    averagingMultiplierByLevel,
    direction,
    entryLevel: normalizedEntryLevel,
    entryTime,
    volatilityPoints,
    watchState,
  });

  if (targetHitSequence) {
    return targetHitSequence;
  }

  const sequence: Array<
    Omit<
      OpenPositionLevelSequenceItem,
      "coveredMarginUsdt" | "isAveraged" | "state" | "unreservedCoverage"
    >
  > = [];
  const seenLevelKeys = new Set<number>();

  const addLevel = (
    level: number,
    source: Omit<
      OpenPositionLevelSequenceItem,
      | "coveredMarginUsdt"
      | "isAveraged"
      | "level"
      | "state"
      | "unreservedCoverage"
    >,
  ) => {
    const key = levelKey(level);
    if (seenLevelKeys.has(key)) {
      return;
    }

    seenLevelKeys.add(key);
    sequence.push({ ...source, level });
  };

  if (normalizedEntryLevel !== null) {
    addLevel(normalizedEntryLevel, { isEntry: true });
  }

  for (const step of watchState?.steps ?? []) {
    const level = finiteLevel(step.level);
    if (level === null) {
      continue;
    }

    addLevel(level, {
      isEntry: false,
      marginUsdt: step.marginUsdt,
      reserveStatus: step.status,
    });
  }

  if (
    normalizedCurrentLevel !== null &&
    !seenLevelKeys.has(levelKey(normalizedCurrentLevel))
  ) {
    const currentMagnitude = levelKey(normalizedCurrentLevel);
    const insertionIndex = sequence.findIndex(
      (item, index) =>
        index > 0 && levelKey(item.level) > currentMagnitude,
    );
    const currentItem = {
      isEntry: false,
      level: normalizedCurrentLevel,
    };

    if (insertionIndex >= 0) {
      sequence.splice(insertionIndex, 0, currentItem);
    } else {
      sequence.push(currentItem);
    }
  }

  const currentLevelKey =
    normalizedCurrentLevel === null ? null : levelKey(normalizedCurrentLevel);
  const currentVPoint = [...(volatilityPoints ?? [])]
    .filter(
      (point) =>
        currentLevelKey !== null &&
        levelKey(point.lvl) === currentLevelKey &&
        (typeof entryTime !== "number" || point.t >= entryTime),
    )
    .sort((a, b) => b.t - a.t)[0];
  const currentDriftPct =
    currentVPoint && (direction === "LONG" || direction === "SHORT")
      ? lateEntryVPointDrift.calculateProfitDriftPct({
          currentPrice: markPrice ?? Number.NaN,
          direction,
          vPointPrice: currentVPoint.p,
        })
      : undefined;
  const currentIndex = sequence.findIndex(
    (item) =>
      currentLevelKey !== null && levelKey(item.level) === currentLevelKey,
  );

  let remainingSpendableQuoteAsset = normalizedSpendableQuoteAsset ?? 0;

  return sequence.map((item, index) => {
    const isAveraged =
      item.reserveStatus === "USED" ||
      averagingMultiplierByLevel.has(levelKey(item.level));
    const validUnreservedMargin =
      item.reserveStatus === "UNRESERVED" &&
      typeof item.marginUsdt === "number" &&
      Number.isFinite(item.marginUsdt) &&
      item.marginUsdt >= 0
        ? item.marginUsdt
        : null;
    let coveredMarginUsdt = 0;
    let unreservedCoverage: PositionLevelSequenceCoverage | undefined;
    let state: PositionLevelSequenceState = "unreserved";

    if (validUnreservedMargin !== null) {
      coveredMarginUsdt = Math.min(
        remainingSpendableQuoteAsset,
        validUnreservedMargin,
      );
      if (coveredMarginUsdt >= validUnreservedMargin) {
        unreservedCoverage = "full";
      } else if (coveredMarginUsdt > 0) {
        unreservedCoverage = "partial";
      } else {
        unreservedCoverage = "none";
      }
      remainingSpendableQuoteAsset = Math.max(
        0,
        remainingSpendableQuoteAsset - coveredMarginUsdt,
      );
    }

    if (index === currentIndex) {
      state = "current";
    } else if (index < currentIndex || item.isEntry || isAveraged) {
      state = "passed";
    } else if (item.reserveStatus === "RESERVED") {
      state = "reserved";
    }

    return {
      ...item,
      averagingMultiplier: averagingMultiplierByLevel.get(
        levelKey(item.level),
      ),
      coveredMarginUsdt,
      driftPct: index === currentIndex ? currentDriftPct : undefined,
      isAveraged,
      state,
      unreservedCoverage,
    };
  });
}

export default function OpenPositionLevelSequence({
  currentLevel,
  direction,
  entryLevel,
  entryTime,
  markPrice,
  reserveMultiplier = 2,
  spendableQuoteAsset,
  volatilityPoints,
  watchState,
}: BuildOpenPositionLevelSequenceParams) {
  const items = buildOpenPositionLevelSequence({
    currentLevel,
    direction,
    entryLevel,
    entryTime,
    markPrice,
    spendableQuoteAsset,
    volatilityPoints,
    watchState,
  });

  return (
    <PositionLevelSequence
      items={items}
      reserveMultiplier={reserveMultiplier}
    />
  );
}
