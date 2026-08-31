import type { VolatilityPoint } from "@/lib/dynamic";

export interface CoinVPointHealth {
  reasons: string[];
  score: number | null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function scale(value: number, unhealthy: number, healthy: number) {
  return clampScore(((value - unhealthy) / (healthy - unhealthy)) * 100);
}

function median(values: number[]) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function describe(value: number, weak: number, healthy: number) {
  if (value >= healthy) return "healthy";
  if (value <= weak) return "weak";
  return "mixed";
}

/**
 * Scores one coin's structural price health using only its cached vPoint prices.
 * The four components detect retained value, long/recent trend, and recovery power.
 */
function calculate(points: VolatilityPoint[]): CoinVPointHealth {
  const prices = points
    .filter(
      (point) =>
        Number.isFinite(point.t) &&
        Number.isFinite(point.p) &&
        point.p > 0,
    )
    .sort((left, right) => left.t - right.t)
    .map((point) => point.p);

  if (prices.length < 8) {
    return {
      reasons: [`Insufficient history: ${prices.length} valid vPoints; need 8`],
      score: null,
    };
  }

  const segmentSize = Math.max(2, Math.floor(prices.length / 4));
  const firstMedian = median(prices.slice(0, segmentSize));
  const previousMedian = median(
    prices.slice(-segmentSize * 2, -segmentSize),
  );
  const recentMedian = median(prices.slice(-segmentSize));
  const latestPrice = prices.at(-1) ?? 0;
  let rangeHigh = prices[0];
  for (const price of prices) {
    if (price > rangeHigh) rangeHigh = price;
  }
  const retentionRatio = latestPrice / rangeHigh;
  const longTermRatio = recentMedian / firstMedian;
  const recentRatio = recentMedian / previousMedian;
  let upwardMovement = 0;
  let totalMovement = 0;

  for (let index = 1; index < prices.length; index += 1) {
    const movement = Math.log(prices[index] / prices[index - 1]);
    const magnitude = Math.abs(movement);
    totalMovement += magnitude;
    if (movement > 0) upwardMovement += magnitude;
  }

  const recoveryShare = totalMovement > 0 ? upwardMovement / totalMovement : 0.5;
  const retentionScore = scale(retentionRatio, 0.08, 0.6);
  const longTermScore = scale(longTermRatio, 0.2, 1);
  const recentScore = scale(recentRatio, 0.65, 1.05);
  const recoveryScore = scale(recoveryShare, 0.3, 0.55);
  const score =
    retentionScore * 0.35 +
    longTermScore * 0.3 +
    recentScore * 0.2 +
    recoveryScore * 0.15;

  return {
    reasons: [
      `Price retention: ${(retentionRatio * 100).toFixed(1)}% of vPoint range high (${describe(retentionRatio, 0.2, 0.6)})`,
      `Long-term price ratio: ${(longTermRatio * 100).toFixed(1)}% recent/early (${describe(longTermRatio, 0.5, 1)})`,
      `Recent price ratio: ${(recentRatio * 100).toFixed(1)}% recent/prior (${describe(recentRatio, 0.8, 1.05)})`,
      `Recovery power: ${(recoveryShare * 100).toFixed(1)}% of log-price movement was upward (${describe(recoveryShare, 0.4, 0.55)})`,
      `Calculated from ${prices.length} cached vPoints only; no BTC benchmark`,
    ],
    score: Math.round(clampScore(score)),
  };
}

const coinVPointHealth = { calculate };

export default coinVPointHealth;
