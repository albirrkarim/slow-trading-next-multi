import type { VolatilityPoint } from "@/lib/dynamic";

const MAX_EXACT_COMBINATIONS = 50_000;
const BEAM_WIDTH = 120;

export interface CapitalLockInterval {
  direction: "LONG" | "SHORT";
  end: number;
  start: number;
  symbol: string;
}

export interface CoinCombinationAnalysis {
  acceptedEntries: number;
  capitalEfficiencyScore: number;
  evaluatedCombinations: number;
  holdDurationAvgMs: number | null;
  holdDurationMaxMs: number | null;
  holdDurationMinMs: number | null;
  holdDurationTotalMs: number | null;
  lockIntervals: CapitalLockInterval[];
  method: "all" | "exact" | "optimized";
  missedEntries: number;
  symbols: string[];
  totalEntryOpportunities: number;
  unusedDurationAvgMs: number | null;
  unusedDurationMaxMs: number | null;
  unusedDurationMinMs: number | null;
  unusedDurationTotalMs: number | null;
}

interface CombinationEvaluation {
  acceptedEntries: number;
  capitalEfficiencyScore: number;
  lockIntervals: CapitalLockInterval[];
  missedEntries: number;
  symbols: string[];
  totalEntryOpportunities: number;
  unusedDurationAvgMs: number | null;
  unusedDurationMaxMs: number | null;
  unusedDurationMinMs: number | null;
  unusedDurationTotalMs: number | null;
  holdDurationAvgMs: number | null;
  holdDurationMaxMs: number | null;
  holdDurationMinMs: number | null;
  holdDurationTotalMs: number | null;
}

function summarizeDurations(durations: number[]) {
  if (durations.length === 0) {
    return { avgMs: null, maxMs: null, minMs: null, totalMs: null };
  }

  let maxMs = durations[0];
  let minMs = durations[0];
  let totalMs = 0;
  for (const duration of durations) {
    totalMs += duration;
    if (duration > maxMs) maxMs = duration;
    if (duration < minMs) minMs = duration;
  }

  return {
    avgMs: totalMs / durations.length,
    maxMs,
    minMs,
    totalMs,
  };
}

function getObservationBounds(volatilityMap: Record<string, VolatilityPoint[]>) {
  let periodStart: number | null = null;
  let periodEnd: number | null = null;

  for (const points of Object.values(volatilityMap)) {
    for (const point of points) {
      if (!Number.isFinite(point.t)) continue;
      if (periodStart === null || point.t < periodStart) periodStart = point.t;
      if (periodEnd === null || point.t > periodEnd) periodEnd = point.t;
    }
  }

  return {
    periodStart: periodStart ?? 0,
    periodEnd: periodEnd ?? periodStart ?? 0,
  };
}

/** Builds capital-lock intervals from threshold entry until the sequence resets. */
function buildLockIntervals({
  maximumLevel,
  minimumLevel,
  periodEnd,
  points,
  symbol,
}: {
  maximumLevel: number;
  minimumLevel: number;
  periodEnd: number;
  points: VolatilityPoint[];
  symbol: string;
}): CapitalLockInterval[] {
  const sorted = points.slice().sort((left, right) => left.t - right.t);
  const intervals: CapitalLockInterval[] = [];
  let direction = 0;
  let entry: VolatilityPoint | null = null;

  const finishSequence = (end: number) => {
    if (entry) {
      intervals.push({
        direction: entry.lvl > 0 ? "SHORT" : "LONG",
        end: Math.max(entry.t, end),
        start: entry.t,
        symbol,
      });
    }
    direction = 0;
    entry = null;
  };

  for (const point of sorted) {
    const pointDirection = Math.sign(point.lvl);
    if (pointDirection === 0) {
      finishSequence(point.t);
      continue;
    }
    if (direction !== 0 && pointDirection !== direction) {
      finishSequence(point.t);
    }
    if (direction === 0) direction = pointDirection;

    const absoluteLevel = Math.abs(point.lvl);
    if (
      !entry &&
      absoluteLevel >= minimumLevel &&
      absoluteLevel <= maximumLevel
    ) {
      entry = point;
    }
  }

  finishSequence(periodEnd);
  return intervals;
}

/** Simulates one reusable capital allocation across a coin combination. */
function evaluateCombination({
  intervalsBySymbol,
  observationEnd,
  observationStart,
  symbols,
}: {
  intervalsBySymbol: Record<string, CapitalLockInterval[]>;
  observationEnd?: number;
  observationStart?: number;
  symbols: string[];
}): CombinationEvaluation {
  const lockIntervals = symbols
    .flatMap((symbol) => intervalsBySymbol[symbol] ?? [])
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.symbol.localeCompare(right.symbol),
    );
  let acceptedEntries = 0;
  let capitalAvailableAt = Number.NEGATIVE_INFINITY;
  const acceptedIntervals: CapitalLockInterval[] = [];

  for (const interval of lockIntervals) {
    if (interval.start < capitalAvailableAt) continue;
    acceptedEntries += 1;
    capitalAvailableAt = interval.end;
    acceptedIntervals.push(interval);
  }

  const totalEntryOpportunities = lockIntervals.length;
  const missedEntries = totalEntryOpportunities - acceptedEntries;
  const holdDurations = acceptedIntervals.map(
    (interval) => interval.end - interval.start,
  );
  const rangeStart =
    observationStart ?? acceptedIntervals[0]?.start ?? lockIntervals[0]?.start;
  const rangeEnd =
    observationEnd ??
    acceptedIntervals.at(-1)?.end ??
    lockIntervals.at(-1)?.end;
  const unusedDurations: number[] = [];

  if (rangeStart !== undefined && rangeEnd !== undefined) {
    let unusedStart = rangeStart;
    for (const interval of acceptedIntervals) {
      if (interval.start > unusedStart) {
        unusedDurations.push(interval.start - unusedStart);
      }
      unusedStart = interval.end;
    }
    if (rangeEnd > unusedStart) {
      unusedDurations.push(rangeEnd - unusedStart);
    }
    if (unusedDurations.length === 0) {
      unusedDurations.push(0);
    }
  }

  const holdDuration = summarizeDurations(holdDurations);
  const unusedDuration = summarizeDurations(unusedDurations);

  return {
    acceptedEntries,
    capitalEfficiencyScore:
      totalEntryOpportunities > 0
        ? (acceptedEntries / totalEntryOpportunities) * 100
        : 0,
    holdDurationAvgMs: holdDuration.avgMs,
    holdDurationMaxMs: holdDuration.maxMs,
    holdDurationMinMs: holdDuration.minMs,
    holdDurationTotalMs: holdDuration.totalMs,
    lockIntervals,
    missedEntries,
    symbols: symbols.slice().sort(),
    totalEntryOpportunities,
    unusedDurationAvgMs: unusedDuration.avgMs,
    unusedDurationMaxMs: unusedDuration.maxMs,
    unusedDurationMinMs: unusedDuration.minMs,
    unusedDurationTotalMs: unusedDuration.totalMs,
  };
}

function isBetterCombination(
  candidate: CombinationEvaluation,
  current: CombinationEvaluation | null,
) {
  if (!current) return true;
  if (candidate.capitalEfficiencyScore !== current.capitalEfficiencyScore) {
    return candidate.capitalEfficiencyScore > current.capitalEfficiencyScore;
  }
  if (candidate.acceptedEntries !== current.acceptedEntries) {
    return candidate.acceptedEntries > current.acceptedEntries;
  }
  if (candidate.totalEntryOpportunities !== current.totalEntryOpportunities) {
    return candidate.totalEntryOpportunities > current.totalEntryOpportunities;
  }
  return candidate.symbols.join(":") < current.symbols.join(":");
}

function countCombinations(total: number, selected: number) {
  const size = Math.min(selected, total - selected);
  let count = 1;
  for (let index = 1; index <= size; index += 1) {
    count = (count * (total - size + index)) / index;
    if (count > MAX_EXACT_COMBINATIONS) return count;
  }
  return Math.round(count);
}

function findExactCombination({
  intervalsBySymbol,
  observationEnd,
  observationStart,
  size,
  symbols,
}: {
  intervalsBySymbol: Record<string, CapitalLockInterval[]>;
  observationEnd: number;
  observationStart: number;
  size: number;
  symbols: string[];
}) {
  let best: CombinationEvaluation | null = null;
  let evaluatedCombinations = 0;

  const visit = (startIndex: number, selected: string[]) => {
    if (selected.length === size) {
      const evaluation = evaluateCombination({
        intervalsBySymbol,
        observationEnd,
        observationStart,
        symbols: selected,
      });
      evaluatedCombinations += 1;
      if (isBetterCombination(evaluation, best)) best = evaluation;
      return;
    }

    const remaining = size - selected.length;
    for (
      let index = startIndex;
      index <= symbols.length - remaining;
      index += 1
    ) {
      selected.push(symbols[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };

  visit(0, []);
  return { best, evaluatedCombinations };
}

function findOptimizedCombination({
  intervalsBySymbol,
  observationEnd,
  observationStart,
  size,
  symbols,
}: {
  intervalsBySymbol: Record<string, CapitalLockInterval[]>;
  observationEnd: number;
  observationStart: number;
  size: number;
  symbols: string[];
}) {
  let candidates: CombinationEvaluation[] = [
    evaluateCombination({
      intervalsBySymbol,
      observationEnd,
      observationStart,
      symbols: [],
    }),
  ];
  let evaluatedCombinations = 0;

  for (let depth = 0; depth < size; depth += 1) {
    const unique = new Map<string, CombinationEvaluation>();
    for (const candidate of candidates) {
      const lastSymbol = candidate.symbols.at(-1);
      const startIndex = lastSymbol ? symbols.indexOf(lastSymbol) + 1 : 0;
      for (let index = startIndex; index < symbols.length; index += 1) {
        const nextSymbols = [...candidate.symbols, symbols[index]];
        if (nextSymbols.length + symbols.length - index - 1 < size) continue;
        const evaluation = evaluateCombination({
          intervalsBySymbol,
          observationEnd,
          observationStart,
          symbols: nextSymbols,
        });
        evaluatedCombinations += 1;
        unique.set(evaluation.symbols.join(":"), evaluation);
      }
    }
    candidates = [...unique.values()]
      .sort((left, right) =>
        isBetterCombination(left, right)
          ? -1
          : isBetterCombination(right, left)
            ? 1
            : 0,
      )
      .slice(0, BEAM_WIDTH);
  }

  return { best: candidates[0] ?? null, evaluatedCombinations };
}

/** Selects the most capital-efficient requested coin combination. */
function selectBestCombination({
  maximumLevel,
  minimumLevel,
  requestedSize,
  volatilityMap,
}: {
  maximumLevel: number;
  minimumLevel: number;
  requestedSize: number;
  volatilityMap: Record<string, VolatilityPoint[]>;
}): CoinCombinationAnalysis {
  const symbols = Object.keys(volatilityMap).sort();
  const { periodEnd, periodStart } = getObservationBounds(volatilityMap);
  const intervalsBySymbol = Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      buildLockIntervals({
        maximumLevel,
        minimumLevel,
        periodEnd,
        points: volatilityMap[symbol],
        symbol,
      }),
    ]),
  );
  const activeSymbols = symbols.filter(
    (symbol) => intervalsBySymbol[symbol].length > 0,
  );
  const normalizedSize = Math.max(0, Math.floor(requestedSize));
  const size = Math.min(normalizedSize, symbols.length);

  if (symbols.length === 0) {
    return {
      ...evaluateCombination({
        intervalsBySymbol,
        observationEnd: periodEnd,
        observationStart: periodStart,
        symbols: [],
      }),
      evaluatedCombinations: 0,
      method: "all",
    };
  }

  if (normalizedSize === 0 || size === symbols.length) {
    return {
      ...evaluateCombination({
        intervalsBySymbol,
        observationEnd: periodEnd,
        observationStart: periodStart,
        symbols,
      }),
      evaluatedCombinations: 1,
      method: "all",
    };
  }

  const candidates = activeSymbols.length >= size ? activeSymbols : symbols;
  const combinationCount = countCombinations(candidates.length, size);
  const search =
    combinationCount <= MAX_EXACT_COMBINATIONS
      ? findExactCombination({
          intervalsBySymbol,
          observationEnd: periodEnd,
          observationStart: periodStart,
          size,
          symbols: candidates,
        })
      : findOptimizedCombination({
          intervalsBySymbol,
          observationEnd: periodEnd,
          observationStart: periodStart,
          size,
          symbols: candidates,
        });
  const best =
    search.best ??
    evaluateCombination({
      intervalsBySymbol,
      observationEnd: periodEnd,
      observationStart: periodStart,
      symbols: candidates.slice(0, size),
    });

  return {
    ...best,
    evaluatedCombinations: search.evaluatedCombinations,
    method:
      combinationCount <= MAX_EXACT_COMBINATIONS ? "exact" : "optimized",
  };
}

const coinCapitalEfficiency = {
  buildLockIntervals,
  evaluateCombination,
  selectBestCombination,
};

export default coinCapitalEfficiency;
