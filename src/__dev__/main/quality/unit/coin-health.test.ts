import coinVPointHealth from "@/lib/devBacktest/coins/health";
import type { VolatilityPoint } from "@/lib/dynamic";
import { describe, expect, it } from "vitest";

function prices(values: number[]): VolatilityPoint[] {
  return values.map(
    (price, index) =>
      ({
        id: `${index}`,
        l: index % 2 === 0 ? "B" : "T",
        lvl: index % 2 === 0 ? -1 : 1,
        p: price,
        pct: 1,
        t: index + 1,
        vb: 1,
        vq: 1,
      }) as VolatilityPoint,
  );
}

describe("coin vPoint health", () => {
  it("scores a stable recovering structure above a persistent collapse", () => {
    const healthy = coinVPointHealth.calculate(
      prices([100, 112, 104, 118, 108, 121, 113, 125, 117, 130, 122, 134]),
    );
    const dying = coinVPointHealth.calculate(
      prices([100, 82, 75, 61, 55, 43, 38, 29, 24, 18, 14, 9]),
    );

    expect(healthy.score).not.toBeNull();
    expect(dying.score).not.toBeNull();
    expect(healthy.score!).toBeGreaterThan(70);
    expect(dying.score!).toBeLessThan(25);
    expect(healthy.score!).toBeGreaterThan(dying.score!);
    expect(dying.reasons.at(-1)).toContain("no BTC benchmark");
  });

  it("does not invent a health score from too few vPoints", () => {
    const health = coinVPointHealth.calculate(prices([100, 90, 95]));

    expect(health.score).toBeNull();
    expect(health.reasons[0]).toContain("need 8");
  });
});
