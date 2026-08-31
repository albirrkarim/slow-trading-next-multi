import type { VolatilityPoint } from "@/lib/dynamic";

const SAMPLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function interpolateLevels(
  points: VolatilityPoint[],
  times: number[],
): number[] {
  const sorted = points.slice().sort((left, right) => left.t - right.t);
  const values: number[] = [];
  let rightIndex = 1;

  for (const time of times) {
    while (
      rightIndex < sorted.length - 1 &&
      sorted[rightIndex].t < time
    ) {
      rightIndex += 1;
    }

    const left = sorted[rightIndex - 1];
    const right = sorted[rightIndex];
    const span = right.t - left.t;
    const progress = span > 0 ? (time - left.t) / span : 0;
    values.push(left.lvl + (right.lvl - left.lvl) * progress);
  }

  return values;
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;

  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? covariance / denominator : null;
}

/**
 * Measures same-direction vPoint level movement on a shared daily timeline.
 * Negative Pearson correlation is clamped to zero so the public score is 0-1.
 */
export function computeVolatilityCorrelation(
  left: VolatilityPoint[],
  right: VolatilityPoint[],
): number | null {
  if (left.length < 2 || right.length < 2) return null;

  const leftSorted = left.slice().sort((a, b) => a.t - b.t);
  const rightSorted = right.slice().sort((a, b) => a.t - b.t);
  const start = Math.max(leftSorted[0].t, rightSorted[0].t);
  const end = Math.min(
    leftSorted.at(-1)?.t ?? 0,
    rightSorted.at(-1)?.t ?? 0,
  );
  if (end <= start) return null;

  const times: number[] = [];
  for (let time = start; time <= end; time += SAMPLE_INTERVAL_MS) {
    times.push(time);
  }
  if (times.length < 2) times.push(end);

  const correlation = pearson(
    interpolateLevels(leftSorted, times),
    interpolateLevels(rightSorted, times),
  );
  return correlation === null ? null : Math.max(0, Math.min(1, correlation));
}

export interface CoinCorrelationScore {
  pairs: Record<string, number>;
  score: number | null;
}

/** Computes each symbol's mean correlation against all comparable symbols. */
export function computeCoinCorrelationScores(
  volatilityMap: Record<string, VolatilityPoint[]>,
): Record<string, CoinCorrelationScore> {
  const symbols = Object.keys(volatilityMap);
  const output = Object.fromEntries(
    symbols.map((symbol) => [symbol, { pairs: {}, score: null }]),
  ) as Record<string, CoinCorrelationScore>;

  for (let leftIndex = 0; leftIndex < symbols.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < symbols.length;
      rightIndex += 1
    ) {
      const leftSymbol = symbols[leftIndex];
      const rightSymbol = symbols[rightIndex];
      const score = computeVolatilityCorrelation(
        volatilityMap[leftSymbol],
        volatilityMap[rightSymbol],
      );
      if (score === null) continue;

      output[leftSymbol].pairs[rightSymbol] = score;
      output[rightSymbol].pairs[leftSymbol] = score;
    }
  }

  for (const symbol of symbols) {
    const pairScores = Object.values(output[symbol].pairs);
    output[symbol].score =
      pairScores.length > 0
        ? pairScores.reduce((sum, score) => sum + score, 0) /
          pairScores.length
        : null;
  }

  return output;
}
