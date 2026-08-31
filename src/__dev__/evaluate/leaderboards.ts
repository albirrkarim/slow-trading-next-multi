import type { CommonEvaluation } from "@/components/api/dynamic";

import type { CacheId } from "@/lib/dynamic";
import type { Leaderboards } from "@/lib/evaluate/analysis/leaderboard-utils/type-dynamic-report";
import moment from "moment-timezone";

export interface DynamicBTestDataset {
  input: CacheId;
  evaluation: CommonEvaluation;
  leaderboards: Leaderboards;
  BASE_COMMON_TIME_FOLDER: string;
}

export function leaderboardsEval(
  grouped: Record<string, any[]>,
  leaderboards: Leaderboards,
  expected: Leaderboards,
  file: string
) {
  const rows: {
    Metric: string;
    Expected: string;
    Actual: string;
    Diff: string;
    Status: string;
  }[] = [];

  const compare = (metric: string, actual: number, expectedLocal: number) => {
    const better = isBetterOrEqual(metric, actual, expectedLocal);
    const status = better ? "✅" : "❌";

    // Convert value depending on type
    if (metric.startsWith("emptyBalance")) {
      const expectedStr = moment
        .duration(expectedLocal, "milliseconds")
        .humanize();
      const actualStr = moment.duration(actual, "milliseconds").humanize();
      const diffStr = moment
        .duration(Math.abs(actual - expectedLocal), "milliseconds")
        .humanize();

      rows.push({
        Metric: metric,
        Expected: expectedStr,
        Actual: actualStr,
        Diff: diffStr,
        Status: status,
      });
    } else if (metric.includes("Percent")) {
      rows.push({
        Metric: metric,
        Expected: expectedLocal.toFixed(2) + " %",
        Actual: actual.toFixed(2) + " %",
        Diff: (actual - expectedLocal).toFixed(2) + " %",
        Status: status,
      });
    } else {
      rows.push({
        Metric: metric,
        Expected: (expectedLocal * 100).toFixed(2) + " %",
        Actual: (actual * 100).toFixed(2) + " %",
        Diff: ((actual - expectedLocal) * 100).toFixed(2) + " %",
        Status: status,
      });
    }
  };

  compare(
    "openFloatingDrawdown.avg",
    leaderboards.openFloatingDrawdown.avg,
    expected.openFloatingDrawdown.avg
  );
  compare(
    "openFloatingDrawdown.max",
    leaderboards.openFloatingDrawdown.max,
    expected.openFloatingDrawdown.max
  );
  compare(
    "maxPortfolioDrawdown.avg",
    leaderboards.maxPortfolioDrawdown.avg,
    expected.maxPortfolioDrawdown.avg
  );
  compare(
    "maxPortfolioDrawdown.max",
    leaderboards.maxPortfolioDrawdown.max,
    expected.maxPortfolioDrawdown.max
  );
  compare(
    "bearMarketProofRatio",
    leaderboards.bearMarketProofRatio,
    expected.bearMarketProofRatio
  );
  compare("gainPercent", leaderboards.gainPercent, expected.gainPercent);
  compare(
    "avgMonthlyProfitRatio",
    leaderboards.avgMonthlyProfitRatio,
    expected.avgMonthlyProfitRatio
  );
  compare(
    "emptyBalance.min",
    leaderboards.emptyBalance.min,
    expected.emptyBalance.min
  );
  compare(
    "emptyBalance.avg",
    leaderboards.emptyBalance.avg,
    expected.emptyBalance.avg
  );
  compare(
    "emptyBalance.max",
    leaderboards.emptyBalance.max,
    expected.emptyBalance.max
  );
  compare(
    "balanceTradesScore",
    leaderboards.balanceTradesScore,
    expected.balanceTradesScore
  );
  compare(
    "capitalEfficiency.hrTimeWeighted",
    leaderboards.capitalEfficiency.hrTimeWeighted,
    expected.capitalEfficiency.hrTimeWeighted
  );
  compare(
    "capitalEfficiency.turnoverPerDay",
    leaderboards.capitalEfficiency.turnoverPerDay,
    expected.capitalEfficiency.turnoverPerDay
  );
  compare(
    "capitalEfficiency.hrScore",
    leaderboards.capitalEfficiency.hrScore,
    expected.capitalEfficiency.hrScore
  );
  compare(
    "capitalEfficiency.trScore",
    leaderboards.capitalEfficiency.trScore,
    expected.capitalEfficiency.trScore
  );
  compare(
    "capitalEfficiency.score",
    leaderboards.capitalEfficiency.score,
    expected.capitalEfficiency.score
  );
  compare("sharpeRatio", leaderboards.sharpeRatio, expected.sharpeRatio);

  // Only add the file entry if there are any ❌ (you can change this if you want all rows)
  if (rows.some((r) => r.Status === "❌")) grouped[file] = rows;
}

const FLOAT_TOLERANCE = 0.01;
function closeTo(a: number, b: number) {
  return Math.abs(a - b) < FLOAT_TOLERANCE;
}

/**
 * “Better” means equal or higher (for scores/ratios)
 * or equal or lower (for drawdowns/times).
 */
function isBetterOrEqual(metric: string, actual: number, expected: number) {
  const lowerIsBetter = [
    "openFloatingDrawdown.avg",
    "openFloatingDrawdown.max",
    "maxPortfolioDrawdown.avg",
    "maxPortfolioDrawdown.max",
    "emptyBalance.min",
    "emptyBalance.avg",
    "emptyBalance.max",
  ];

  if (closeTo(actual, expected)) return true;
  if (lowerIsBetter.some((k) => metric.includes(k))) {
    return actual <= expected;
  } else {
    return actual >= expected;
  }
}
