import type { VolatilityPoint } from "@/lib/dynamic";

export interface VPointPctDistributionOccurrence {
  id?: string;
  lvl: number;
  pct: number;
  t?: number;
}

export interface VPointPctDistributionBucket {
  count: number;
  label: string;
  maxPct: number;
  minPct: number;
  /** Details retained only while this bucket contains at most two points. */
  occurrences?: VPointPctDistributionOccurrence[];
}

const DEFAULT_INTERVAL = 5;
const MINIMUM_INTERVAL = 0.1;

/** Normalizes the percentage interval used by the vPoint distribution. */
function normalizeInterval(value: number): number {
  return Number.isFinite(value) && value >= MINIMUM_INTERVAL
    ? value
    : DEFAULT_INTERVAL;
}

function getDecimalPlaces(interval: number): number {
  return Math.min(
    6,
    Math.max(0, (String(interval).split(".")[1] ?? "").length),
  );
}

function roundBoundary(value: number, interval: number): number {
  return Number(value.toFixed(getDecimalPlaces(interval)));
}

/** Counts finite vPoint percentages in occupied half-open ranges. */
function compute(
  points: VolatilityPoint[],
  intervalInput: number,
): VPointPctDistributionBucket[] {
  // BOTH:VPOINT_PCT_DISTRIBUTION
  const interval = normalizeInterval(intervalInput);
  const counts = new Map<
    number,
    { count: number; occurrences?: VPointPctDistributionOccurrence[] }
  >();

  for (const point of points) {
    if (!Number.isFinite(point.pct)) continue;
    const bucketIndex = Math.floor(
      (point.pct + Number.EPSILON * 100) / interval,
    );
    const current = counts.get(bucketIndex);
    const occurrence = {
      ...(String(point.id ?? "").trim() ? { id: String(point.id).trim() } : {}),
      lvl: point.lvl,
      pct: point.pct,
      ...(Number.isFinite(point.t) ? { t: point.t } : {}),
    };
    if (!current) {
      counts.set(bucketIndex, {
        count: 1,
        occurrences: [occurrence],
      });
      continue;
    }

    counts.set(
      bucketIndex,
      current.count === 1
        ? {
            count: 2,
            occurrences: [...(current.occurrences ?? []), occurrence],
          }
        : { count: current.count + 1 },
    );
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucketIndex, occurrence]) => {
      const minPct = roundBoundary(bucketIndex * interval, interval);
      const maxPct = roundBoundary(minPct + interval, interval);
      return {
        count: occurrence.count,
        label: `${minPct} – ${maxPct}%`,
        maxPct,
        minPct,
        ...(occurrence.occurrences
          ? { occurrences: occurrence.occurrences }
          : {}),
      };
    });
}

const vPointPctDistribution = {
  compute,
  interval: {
    defaultValue: DEFAULT_INTERVAL,
    minimum: MINIMUM_INTERVAL,
    normalize: normalizeInterval,
  },
};

export default vPointPctDistribution;
