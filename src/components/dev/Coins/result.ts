import type { CoinFinderResult } from "@/lib/devBacktest/coins/types";
import {
  EMPTY_COIN_RESULT_FILTERS,
  type CoinResultFilters,
} from "@/lib/devBacktest/coins/filter-config";

export type CoinResultSortKey =
  | "symbol"
  | "firstSeen"
  | "healthScore"
  | "correlationScore"
  | "entrySequenceCount"
  | "entrySignalsPerMonth"
  | "holdDurationAvgMs"
  | "holdDurationMaxMs"
  | "holdDurationMinMs"
  | "marketCapUSD"
  | "maxTop"
  | "maxBottom"
  | "maxLevelAbsolute"
  | "pointCount"
  | "vPointCloseDistanceOccurrences"
  | "vPointPctAvg"
  | "vPointPctMax"
  | "vPointPctMin"
  | "vPointsPerMonth"
  | "vPointTransitionAvgMs"
  | "vPointTransitionMaxMs"
  | "vPointTransitionMinMs"
  | "avgBottomToTopMs"
  | "avgTopToBottomMs"
  | "maxBottomToTopMs"
  | "maxTopToBottomMs";

export { EMPTY_COIN_RESULT_FILTERS };
export type { CoinResultFilters };

function parseFilter(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Returns the same UTC day, clamped safely, a number of calendar months ago. */
function subtractUtcCalendarMonths(nowMs: number, months: number) {
  const cutoff = new Date(nowMs);
  const originalDay = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - Math.floor(Math.max(0, months)));
  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(originalDay, lastDay));
  return cutoff.getTime();
}

/** Checks whether first-seen history is newer than the required age. */
export function isFirstSeenYoungerThanMonths({
  firstSeen,
  minimumMonths,
  nowMs = Date.now(),
}: {
  firstSeen: number | null;
  minimumMonths: number;
  nowMs?: number;
}) {
  if (firstSeen === null) return false;
  return firstSeen > subtractUtcCalendarMonths(nowMs, minimumMonths);
}

/** Filters candidate coins with AND semantics before combination selection. */
export function filterCoinResults({
  filters,
  nowMs = Date.now(),
  results,
}: {
  filters: CoinResultFilters;
  nowMs?: number;
  results: CoinFinderResult[];
}): CoinFinderResult[] {
  const firstSeenMinimumMonths = parseFilter(filters.firstSeenMinimumMonths);
  const entrySequenceCountMinimum = parseFilter(
    filters.entrySequenceCountMinimum,
  );
  const entrySignalsPerMonthMinimum = parseFilter(
    filters.entrySignalsPerMonthMinimum,
  );
  const holdDurationAvgMaxHours = parseFilter(
    filters.holdDurationAvgMaxHours,
  );
  const holdDurationMaxMaxHours = parseFilter(
    filters.holdDurationMaxMaxHours,
  );
  const holdDurationMinMaxHours = parseFilter(
    filters.holdDurationMinMaxHours,
  );
  const healthScoreMinimum = parseFilter(filters.healthScoreMinimum);
  const maxTop = parseFilter(filters.maxTop);
  const maxBottom = parseFilter(filters.maxBottom);
  const avgBottomToTopMaxHours = parseFilter(
    filters.avgBottomToTopMaxHours,
  );
  const avgTopToBottomMaxHours = parseFilter(
    filters.avgTopToBottomMaxHours,
  );
  const maxBottomToTopMaxHours = parseFilter(
    filters.maxBottomToTopMaxHours,
  );
  const maxTopToBottomMaxHours = parseFilter(
    filters.maxTopToBottomMaxHours,
  );
  const maxLevelAbsolute = parseFilter(filters.maxLevelAbsolute);
  const vPointsPerMonthMinimum = parseFilter(filters.vPointsPerMonthMinimum);
  const vPointTransitionAvgHours = parseFilter(
    filters.vPointTransitionAvgHours,
  );
  const vPointTransitionMaxHours = parseFilter(
    filters.vPointTransitionMaxHours,
  );
  const hourMs = 60 * 60 * 1000;
  const firstSeenCutoff =
    firstSeenMinimumMonths === null
      ? null
      : subtractUtcCalendarMonths(nowMs, firstSeenMinimumMonths);

  return results.filter((result) => {
    if (
      entrySequenceCountMinimum !== null &&
      !(
        result.entrySequenceCount !== null &&
        result.entrySequenceCount >= entrySequenceCountMinimum
      )
    ) {
      return false;
    }
    if (
      entrySignalsPerMonthMinimum !== null &&
      !(
        result.entrySignalsPerMonth !== null &&
        result.entrySignalsPerMonth >= entrySignalsPerMonthMinimum
      )
    ) {
      return false;
    }
    if (
      firstSeenMinimumMonths !== null &&
      !(
        result.firstSeen !== null &&
        firstSeenCutoff !== null &&
        result.firstSeen <= firstSeenCutoff
      )
    ) {
      return false;
    }
    if (
      healthScoreMinimum !== null &&
      !(result.healthScore !== null && result.healthScore >= healthScoreMinimum)
    ) {
      return false;
    }
    if (maxTop !== null && !(result.maxTop !== null && result.maxTop <= maxTop)) {
      return false;
    }
    if (
      maxBottom !== null &&
      !(result.maxBottom !== null && result.maxBottom <= maxBottom)
    ) {
      return false;
    }
    if (
      maxLevelAbsolute !== null &&
      !(
        result.maxLevelAbsolute !== null &&
        result.maxLevelAbsolute <= maxLevelAbsolute
      )
    ) {
      return false;
    }
    if (
      vPointsPerMonthMinimum !== null &&
      !(
        result.vPointsPerMonth !== null &&
        result.vPointsPerMonth >= vPointsPerMonthMinimum
      )
    ) {
      return false;
    }
    if (
      vPointTransitionAvgHours !== null &&
      !(
        result.vPointTransitionAvgMs !== null &&
        result.vPointTransitionAvgMs <= vPointTransitionAvgHours * hourMs
      )
    ) {
      return false;
    }
    if (
      vPointTransitionMaxHours !== null &&
      !(
        result.vPointTransitionMaxMs !== null &&
        result.vPointTransitionMaxMs <= vPointTransitionMaxHours * hourMs
      )
    ) {
      return false;
    }
    if (
      holdDurationMinMaxHours !== null &&
      !(
        result.holdDurationMinMs != null &&
        result.holdDurationMinMs <= holdDurationMinMaxHours * hourMs
      )
    ) {
      return false;
    }
    if (
      holdDurationAvgMaxHours !== null &&
      !(
        result.holdDurationAvgMs != null &&
        result.holdDurationAvgMs <= holdDurationAvgMaxHours * hourMs
      )
    ) {
      return false;
    }
    if (
      holdDurationMaxMaxHours !== null &&
      !(
        result.holdDurationMaxMs != null &&
        result.holdDurationMaxMs <= holdDurationMaxMaxHours * hourMs
      )
    ) {
      return false;
    }
    if (
      avgBottomToTopMaxHours !== null &&
      !(
        result.avgBottomToTopMs != null &&
        result.avgBottomToTopMs <= avgBottomToTopMaxHours * hourMs
      )
    ) {
      return false;
    }
    if (
      avgTopToBottomMaxHours !== null &&
      !(
        result.avgTopToBottomMs != null &&
        result.avgTopToBottomMs <= avgTopToBottomMaxHours * hourMs
      )
    ) {
      return false;
    }
    if (
      maxBottomToTopMaxHours !== null &&
      !(
        result.maxBottomToTopMs != null &&
        result.maxBottomToTopMs <= maxBottomToTopMaxHours * hourMs
      )
    ) {
      return false;
    }
    if (
      maxTopToBottomMaxHours !== null &&
      !(
        result.maxTopToBottomMs != null &&
        result.maxTopToBottomMs <= maxTopToBottomMaxHours * hourMs
      )
    ) {
      return false;
    }
    return true;
  });
}

/** Keeps coins assigned every selected tag, using case-insensitive matching. */
export function filterCoinResultsByTags({
  coinTags,
  requiredTags,
  results,
}: {
  coinTags: Record<string, string[]>;
  requiredTags: string[];
  results: CoinFinderResult[];
}): CoinFinderResult[] {
  if (requiredTags.length === 0) return results;
  const required = requiredTags.map((tag) => tag.toLocaleLowerCase());

  return results.filter((result) => {
    const assigned = new Set(
      (coinTags[result.symbol] ?? []).map((tag) => tag.toLocaleLowerCase()),
    );
    return required.every((tag) => assigned.has(tag));
  });
}

/** Filters configured limits, then sorts the remaining result rows. */
export function filterAndSortCoinResults({
  direction,
  filters,
  results,
  sortKey,
}: {
  direction: "asc" | "desc";
  filters: CoinResultFilters;
  results: CoinFinderResult[];
  sortKey: CoinResultSortKey;
}): CoinFinderResult[] {
  const filtered = filterCoinResults({ filters, results });
  const multiplier = direction === "asc" ? 1 : -1;

  return filtered.sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];

    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue) * multiplier;
    }
    return (Number(leftValue) - Number(rightValue)) * multiplier;
  });
}
