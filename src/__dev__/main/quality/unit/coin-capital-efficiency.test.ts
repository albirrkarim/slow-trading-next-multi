import type { VolatilityPoint } from "@/lib/dynamic";
import coinCapitalEfficiency from "@/lib/devBacktest/coins/capital-efficiency";
import { describe, expect, it } from "vitest";

function point(t: number, lvl: number): VolatilityPoint {
  return {
    id: `${t}-${lvl}`,
    l: lvl >= 0 ? "T" : "B",
    lvl,
    pct: Math.abs(lvl),
    p: 100,
    t,
    vb: 1,
    vq: 1,
  } as VolatilityPoint;
}

describe("coin combination capital efficiency", () => {
  it("locks capital at the first threshold point and releases it at level zero", () => {
    const intervals = coinCapitalEfficiency.buildLockIntervals({
      maximumLevel: 5,
      minimumLevel: 3,
      periodEnd: 100,
      points: [point(10, 1), point(20, 3), point(30, 5), point(40, 0)],
      symbol: "A",
    });

    expect(intervals).toEqual([
      { direction: "SHORT", end: 40, start: 20, symbol: "A" },
    ]);
  });

  it("scores missed opportunities while capital is locked", () => {
    const evaluation = coinCapitalEfficiency.evaluateCombination({
      intervalsBySymbol: {
        A: [{ direction: "SHORT", end: 50, start: 10, symbol: "A" }],
        B: [{ direction: "LONG", end: 60, start: 20, symbol: "B" }],
      },
      observationEnd: 100,
      observationStart: 0,
      symbols: ["A", "B"],
    });

    expect(evaluation.acceptedEntries).toBe(1);
    expect(evaluation.missedEntries).toBe(1);
    expect(evaluation.capitalEfficiencyScore).toBe(50);
    expect(evaluation.holdDurationMinMs).toBe(40);
    expect(evaluation.holdDurationAvgMs).toBe(40);
    expect(evaluation.holdDurationMaxMs).toBe(40);
    expect(evaluation.holdDurationTotalMs).toBe(40);
    expect(evaluation.unusedDurationMinMs).toBe(10);
    expect(evaluation.unusedDurationAvgMs).toBe(30);
    expect(evaluation.unusedDurationMaxMs).toBe(50);
    expect(evaluation.unusedDurationTotalMs).toBe(60);
  });

  it("selects the non-overlapping combination and supports zero as all coins", () => {
    const volatilityMap = {
      A: [point(10, 3), point(50, 0)],
      B: [point(20, -3), point(60, 0)],
      C: [point(60, 3), point(100, 0)],
    };
    const best = coinCapitalEfficiency.selectBestCombination({
      maximumLevel: 5,
      minimumLevel: 3,
      requestedSize: 2,
      volatilityMap,
    });
    const all = coinCapitalEfficiency.selectBestCombination({
      maximumLevel: 5,
      minimumLevel: 3,
      requestedSize: 0,
      volatilityMap,
    });

    expect(best.symbols).toEqual(["A", "C"]);
    expect(best.capitalEfficiencyScore).toBe(100);
    expect(best.holdDurationMinMs).toBe(40);
    expect(best.holdDurationAvgMs).toBe(40);
    expect(best.holdDurationMaxMs).toBe(40);
    expect(best.holdDurationTotalMs).toBe(80);
    expect(best.unusedDurationMinMs).toBe(10);
    expect(best.unusedDurationAvgMs).toBe(10);
    expect(best.unusedDurationMaxMs).toBe(10);
    expect(best.unusedDurationTotalMs).toBe(10);
    expect(best.method).toBe("exact");
    expect(all.symbols).toEqual(["A", "B", "C"]);
    expect(all.method).toBe("all");
  });

  it("handles large volatility maps without stack-heavy min/max spreads", () => {
    const points = Array.from({ length: 150_000 }, (_item, index) =>
      point(index * 60_000, index % 30 === 0 ? 3 : 0),
    );

    const analysis = coinCapitalEfficiency.selectBestCombination({
      maximumLevel: 5,
      minimumLevel: 3,
      requestedSize: 0,
      volatilityMap: { BIG: points },
    });

    expect(analysis.method).toBe("all");
    expect(analysis.symbols).toEqual(["BIG"]);
    expect(analysis.totalEntryOpportunities).toBeGreaterThan(0);
  });
});
