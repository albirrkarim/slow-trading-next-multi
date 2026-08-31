import moment from "moment";
import type { VolatilityPoint } from "./volatility";

export interface WaitingStats {
  skipMax: number;

  meanMsRounded: number;
  meanHumanRounded: string | null;

  meanMs: number | null;
  meanHuman: string | null;
  maxMs: number | null;
  maxHuman: string | null;
  count: number;
  durationsMs: string[]; // individual waiting times in ms

  // new skip info per waiting side:
  meanCountSkip?: number | null; // average skipped same-labels per pairing
  skipsPerPair?: number[]; // individual skipped counts per pairing
  skipsTotal?: number; // total skipped
}

/**
 * Result structure
 */
export interface MeanWaitingResult {
  topToBottom: WaitingStats; // TOP -> BOTTOM (mean time to wait for entry)
  bottomToTop: WaitingStats; // BOTTOM -> TOP (mean time to wait for tp)
}

export interface RunTransitionPair {
  fromTime: number;
  fromTimeHuman: string;
  toTime: number;
  toTimeHuman: string;
  durationMs: number;
  durationHuman: string;
}

export interface RunTransitionStats {
  count: number;
  latest: RunTransitionPair | null;
  meanMs: number | null;
  meanHuman: string | null;
}

export interface RunTransitionResult {
  topToBottom: RunTransitionStats;
  bottomToTop: RunTransitionStats;
}

export interface AnchoredRunTransitionResult {
  begin: RunTransitionResult;
  end: RunTransitionResult;
}

/**
 * Format milliseconds into a human readable duration string like "2d 3h 4m"
 */
export function formatDuration(ms: number | null): string {
  const d = moment.duration(ms);
  const days = Math.floor(d.asDays());
  const hours = d.hours();
  const minutes = d.minutes();
  const seconds = d.seconds();

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && parts.length === 0) parts.push(`${seconds}s`); // show seconds only if short
  return parts.length ? parts.join(" ") : "0s";
}

/**
 * Compute mean (average) from array of numbers. Returns null for empty array.
 */
function mean(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const s = values.reduce((a, b) => a + b, 0);
  return s / values.length;
}

/**
 * Compute mean waiting times for TOP->BOTTOM and BOTTOM->TOP, and count skipped same-labels.
 *
 * Behaviour:
 * - For each TOP, search forward for the first BOTTOM after it; record (bottom.time - top.time).
 *   While searching, count how many TOPs were encountered before that BOTTOM (these are "skipped TOPs").
 * - For each BOTTOM, search forward for the first TOP after it; record (top.time - bottom.time).
 *   While searching, count how many BOTTOMs were encountered before that TOP (these are "skipped BOTTOMs").
 *
 * @param points VolatilityPoint[] - array of detected points, MUST be sorted by time ascending
 */
export function computeMeanWaitingTimes(
  points: VolatilityPoint[]
): MeanWaitingResult {
  // defensive: ensure sorted ascending by time
  const pts = points.slice().sort((a, b) => a.t - b.t);

  const topToBottomDurations: number[] = [];
  const bottomToTopDurations: number[] = [];

  const topToBottomSkipsPerPair: number[] = [];
  const bottomToTopSkipsPerPair: number[] = [];

  // We'll scan: when we see a TOP we find next BOTTOM; when we see a BOTTOM we find next TOP.
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];

    if (p.l === "T") {
      // find next BOTTOM after index i and count skipped TOPs
      let skipCount = 0;
      let found = false;
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[j].l === "T") {
          skipCount++; // another TOP encountered before we find a BOTTOM
          continue;
        }
        if (pts[j].l === "B") {
          const dt = pts[j].t - p.t;
          if (dt >= 0) topToBottomDurations.push(dt);
          topToBottomSkipsPerPair.push(skipCount);
          found = true;
          break; // stop at first BOTTOM
        }
      }
      // if not found, ignore this TOP (no subsequent BOTTOM)
      if (!found) {
        // no-op
      }
    } else if (p.l === "B") {
      // find next TOP after index i and count skipped BOTTOMs
      let skipCount = 0;
      let found = false;
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[j].l === "B") {
          skipCount++;
          continue;
        }
        if (pts[j].l === "T") {
          const dt = pts[j].t - p.t;
          if (dt >= 0) bottomToTopDurations.push(dt);
          bottomToTopSkipsPerPair.push(skipCount);
          found = true;
          break; // stop at first TOP
        }
      }
      // if not found, ignore
      if (!found) {
        // no-op
      }
    }
  }

  const topToBottomMean = mean(topToBottomDurations);
  const bottomToTopMean = mean(bottomToTopDurations);
  const topToBottomMax =
    topToBottomDurations.length > 0 ? Math.max(...topToBottomDurations) : null;
  const bottomToTopMax =
    bottomToTopDurations.length > 0
      ? Math.max(...bottomToTopDurations)
      : null;

  const topToBottomSkipsTotal = topToBottomSkipsPerPair.reduce(
    (a, b) => a + b,
    0
  );
  const bottomToTopSkipsTotal = bottomToTopSkipsPerPair.reduce(
    (a, b) => a + b,
    0
  );

  const topToBottomMeanSkip = mean(topToBottomSkipsPerPair);
  const bottomToTopMeanSkip = mean(bottomToTopSkipsPerPair);

  const tbSkipMax =
    topToBottomSkipsPerPair.length > 0
      ? Math.max(...topToBottomSkipsPerPair)
      : 0;
  const btSkipMax =
    bottomToTopSkipsPerPair.length > 0
      ? Math.max(...bottomToTopSkipsPerPair)
      : 0;

  const tbMsRounded = roundMsToNearest10Minutes(topToBottomMean ?? 0);
  const btMsRounded = roundMsToNearest10Minutes(bottomToTopMean ?? 0);

  const result: MeanWaitingResult = {
    topToBottom: {
      skipMax: tbSkipMax,

      meanMsRounded: tbMsRounded,
      meanHumanRounded: formatDuration(tbMsRounded),

      meanMs: topToBottomMean,
      meanHuman:
        topToBottomMean === null ? null : formatDuration(topToBottomMean),
      maxMs: topToBottomMax,
      maxHuman:
        topToBottomMax === null ? null : formatDuration(topToBottomMax),
      count: topToBottomDurations.length,
      durationsMs: topToBottomDurations.map((e) => formatDuration(e)),

      // skip info
      meanCountSkip: topToBottomMeanSkip,
      skipsPerPair: topToBottomSkipsPerPair,
      skipsTotal: topToBottomSkipsTotal,
    },
    bottomToTop: {
      skipMax: btSkipMax,

      meanMsRounded: btMsRounded,
      meanHumanRounded: formatDuration(btMsRounded),

      meanMs: bottomToTopMean,
      meanHuman:
        bottomToTopMean === null ? null : formatDuration(bottomToTopMean),
      maxMs: bottomToTopMax,
      maxHuman:
        bottomToTopMax === null ? null : formatDuration(bottomToTopMax),
      count: bottomToTopDurations.length,
      durationsMs: bottomToTopDurations.map((e) => formatDuration(e)),

      // skip info
      meanCountSkip: bottomToTopMeanSkip,
      skipsPerPair: bottomToTopSkipsPerPair,
      skipsTotal: bottomToTopSkipsTotal,
    },
  };

  return result;
}

function formatPointTime(point: VolatilityPoint): string {
  return moment(point.t).utc().format("DD_MMM_YYYY_HH_mm");
}

function toRunTransitionPair(
  fromPoint: VolatilityPoint,
  toPoint: VolatilityPoint,
): RunTransitionPair | null {
  const durationMs = toPoint.t - fromPoint.t;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  return {
    fromTime: fromPoint.t,
    fromTimeHuman: formatPointTime(fromPoint),
    toTime: toPoint.t,
    toTimeHuman: formatPointTime(toPoint),
    durationMs,
    durationHuman: moment.duration(durationMs).humanize(),
  };
}

function buildRuns(points: VolatilityPoint[]) {
  const sorted = points
    .slice()
    .filter((point) => Number.isFinite(point?.t))
    .sort((a, b) => a.t - b.t);

  const runs: Array<{
    label: VolatilityPoint["l"];
    begin: VolatilityPoint;
    end: VolatilityPoint;
  }> = [];

  for (const point of sorted) {
    const lastRun = runs.at(-1);

    if (!lastRun || lastRun.label !== point.l) {
      runs.push({
        label: point.l,
        begin: point,
        end: point,
      });
      continue;
    }

    lastRun.end = point;
  }

  return runs;
}

function summarizeRunTransitionPairs(
  pairs: RunTransitionPair[],
): RunTransitionStats {
  const meanMs =
    pairs.length > 0
      ? pairs.reduce((sum, pair) => sum + pair.durationMs, 0) / pairs.length
      : null;

  return {
    count: pairs.length,
    latest: pairs.at(-1) ?? null,
    meanMs,
    meanHuman: meanMs !== null ? moment.duration(meanMs).humanize() : null,
  };
}

function computeRunTransitionStatsFromAnchor(
  points: VolatilityPoint[],
  fromAnchor: "begin" | "end",
): RunTransitionResult {
  const runs = buildRuns(points);
  const topToBottomPairs: RunTransitionPair[] = [];
  const bottomToTopPairs: RunTransitionPair[] = [];

  for (let index = 0; index < runs.length - 1; index++) {
    const currentRun = runs[index];
    const nextRun = runs[index + 1];
    const fromPoint =
      fromAnchor === "begin" ? currentRun.begin : currentRun.end;
    const pair = toRunTransitionPair(fromPoint, nextRun.begin);

    if (!pair) {
      continue;
    }

    if (currentRun.label === "T" && nextRun.label === "B") {
      topToBottomPairs.push(pair);
    }

    if (currentRun.label === "B" && nextRun.label === "T") {
      bottomToTopPairs.push(pair);
    }
  }

  return {
    topToBottom: summarizeRunTransitionPairs(topToBottomPairs),
    bottomToTop: summarizeRunTransitionPairs(bottomToTopPairs),
  };
}

/**
 * Compute transition stats using the beginning of each same-label run.
 *
 * Example:
 * B(level 0) -> B(level -1) -> B(level -2) -> T(level 0)
 * counts as one BOTTOM -> TOP transition from B(level 0) to T(level 0).
 */
export function computeRunTransitionStats(
  points: VolatilityPoint[],
): RunTransitionResult {
  return computeRunTransitionStatsFromAnchor(points, "begin");
}

/**
 * Compute both begin-anchored and end-anchored run transition stats.
 *
 * Begin example:
 * T(0) -> T(1) -> T(2) -> B(0)
 * measures T(0) -> B(0)
 *
 * End example:
 * T(0) -> T(1) -> T(2) -> B(0)
 * measures T(2) -> B(0)
 */
export function computeAnchoredRunTransitionStats(
  points: VolatilityPoint[],
): AnchoredRunTransitionResult {
  return {
    begin: computeRunTransitionStatsFromAnchor(points, "begin"),
    end: computeRunTransitionStatsFromAnchor(points, "end"),
  };
}

function roundMsToNearest10Minutes(ms: number): number {
  const tenMinutes = 10 * 60 * 1000; // 10 minutes in ms
  return Math.round(ms / tenMinutes) * tenMinutes;
}
