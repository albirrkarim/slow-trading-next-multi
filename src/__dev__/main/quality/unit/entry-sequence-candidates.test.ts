import entrySequenceCandidates from "@/components/LiveDashboard/Feature/entry-sequence-candidates";
import type { VolatilityPoint } from "@/lib/dynamic";
import { describe, expect, it } from "vitest";

function point(lvl: number, t: number): VolatilityPoint {
  return {
    id: `point-${t}`,
    l: lvl < 0 ? "B" : "T",
    lvl,
    p: 1,
    pct: 1,
    t,
    vb: 1,
    vq: 1,
  } as VolatilityPoint;
}

describe("dashboard entry-sequence candidates", () => {
  it("uses the configured minimum actionable absolute level", () => {
    const volatilityMap = {
      BTC: [point(4, 1)],
      sol: [point(1, 2), point(2, 3), point(-2, 4), point(3, 5)],
    };

    expect(
      entrySequenceCandidates
        .build({ minActionableAbsoluteLevel: 2, volatilityMap })
        .map((candidate) => [candidate.symbol, candidate.lvl]),
    ).toEqual([
      ["SOL", 2],
      ["SOL", -2],
      ["SOL", 3],
    ]);

    expect(
      entrySequenceCandidates
        .build({ minActionableAbsoluteLevel: 3, volatilityMap })
        .map((candidate) => candidate.lvl),
    ).toEqual([3]);
  });

  it("uses decision v19 threshold resolution for missing or low values", () => {
    expect(entrySequenceCandidates.threshold.resolve()).toBe(2);
    expect(entrySequenceCandidates.threshold.resolve(0)).toBe(1);
    expect(entrySequenceCandidates.threshold.resolve(3.9)).toBe(3);
  });
});
