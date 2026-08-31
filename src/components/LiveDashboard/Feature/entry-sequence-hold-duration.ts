import type { SlowEntrySequenceInterval } from "@/lib/slowTrading/client";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const BUCKETS = [
  { label: "<15m", maxExclusiveMs: 15 * MINUTE_MS },
  { label: "15–30m", maxExclusiveMs: 30 * MINUTE_MS },
  { label: "30m–1h", maxExclusiveMs: HOUR_MS },
  { label: "1–2h", maxExclusiveMs: 2 * HOUR_MS },
  { label: "2–4h", maxExclusiveMs: 4 * HOUR_MS },
  { label: "4–8h", maxExclusiveMs: 8 * HOUR_MS },
  { label: "8–24h", maxExclusiveMs: DAY_MS },
  { label: "1–3d", maxExclusiveMs: 3 * DAY_MS },
  { label: "3d+", maxExclusiveMs: Number.POSITIVE_INFINITY },
] as const;

export interface EntrySequenceHoldDurationBucket {
  count: number;
  label: string;
  share: number;
}

/** Groups entry sequences into fixed, comparable hold-duration ranges. */
export function buildEntrySequenceHoldDurationDistribution(
  intervals: SlowEntrySequenceInterval[],
): EntrySequenceHoldDurationBucket[] {
  const counts = BUCKETS.map(() => 0);

  for (const interval of intervals) {
    const durationMs = Math.max(0, interval.endTimeMs - interval.startTimeMs);
    const bucketIndex = BUCKETS.findIndex(
      (bucket) => durationMs < bucket.maxExclusiveMs,
    );
    if (bucketIndex >= 0) counts[bucketIndex] += 1;
  }

  return BUCKETS.map((bucket, index) => ({
    count: counts[index],
    label: bucket.label,
    share: intervals.length > 0 ? (counts[index] / intervals.length) * 100 : 0,
  }));
}
