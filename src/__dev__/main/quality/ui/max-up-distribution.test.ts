import { describe, expect, it } from "vitest";

import {
  computeMaxUpDistribution,
  normalizeMaxUpDistributionInterval,
} from "@/components/LiveDashboard/Reporting/utils";
import type { SlowTradingReportRow } from "@/components/LiveDashboard/Reporting/types";
import { createTestPosition } from "../fixtures/position";

function makeHistory(maxUpValues: Array<number | undefined>) {
  return maxUpValues.map((maxUpPct, index) =>
    createTestPosition({
      pnl: { maxUpPct },
      symbol: `COIN_${index}`,
    }),
  ) as SlowTradingReportRow[];
}

describe("Max Up distribution", () => {
  it("counts boundary values in configurable half-open ranges", () => {
    const result = computeMaxUpDistribution(
      makeHistory([0, 0.49, 0.5, 0.99, 1, 1.5, undefined]),
      0.5,
    );

    expect(result).toEqual([
      { count: 2, label: "0 - 0.5", maxPct: 0.5, minPct: 0 },
      { count: 2, label: "0.5 - 1", maxPct: 1, minPct: 0.5 },
      { count: 1, label: "1 - 1.5", maxPct: 1.5, minPct: 1 },
      { count: 1, label: "1.5 - 2", maxPct: 2, minPct: 1.5 },
    ]);
  });

  it("falls back to the default interval for invalid or tiny values", () => {
    expect(normalizeMaxUpDistributionInterval(0)).toBe(0.5);
    expect(normalizeMaxUpDistributionInterval(0.01)).toBe(0.5);
    expect(normalizeMaxUpDistributionInterval(1)).toBe(1);
  });

  it("keeps exact decimal boundaries in the next half-open bucket", () => {
    const result = computeMaxUpDistribution(makeHistory([0.3]), 0.1);

    expect(result.at(-1)).toEqual({
      count: 1,
      label: "0.3 - 0.4",
      maxPct: 0.4,
      minPct: 0.3,
    });
  });
});
