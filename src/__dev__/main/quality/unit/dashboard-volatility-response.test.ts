import type { VolatilityPoint } from "@/lib/dynamic";
import slowTrading from "@/lib/slowTrading";
import {
  buildDashboardVolatilityCacheWindow,
  filterDashboardEntrySignalResponse,
  getDashboardVolatilityCacheBucket,
} from "@/pages/api/dashboard/volatility";
import { describe, expect, it } from "vitest";

function point(id: string, t: number): VolatilityPoint {
  return {
    id,
    l: "B",
    lvl: -3,
    pct: -3,
    p: 1,
    t,
    vb: 1,
    vq: 1,
  } as VolatilityPoint;
}

describe("dashboard volatility response", () => {
  it("returns only the selected range plus each symbol's latest point", () => {
    const response = slowTrading.entrySequences.range.crop({
      startTimeMs: 200,
      endTimeMs: 300,
      volatilityMap: {
        SUI: [point("old", 100), point("visible", 250), point("latest", 500)],
      },
    });

    expect(response.SUI.map((item) => item.id)).toEqual(["visible"]);
  });

  it("returns only entry signal markers in the selected range", () => {
    const response = filterDashboardEntrySignalResponse({
      startTimeMs: 200,
      endTimeMs: 300,
      entrySignals: [
        point("old", 100),
        point("visible", 250),
        point("future", 500),
      ],
    });

    expect(response.map((item) => item.id)).toEqual(["visible"]);
  });

  it("uses a stable daily cache window for rolling dashboard ranges", () => {
    const first = buildDashboardVolatilityCacheWindow({
      range: "1month",
      startTimeMs: 100,
      endTimeMs: 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
    });
    const sameDay = buildDashboardVolatilityCacheWindow({
      range: "1month",
      startTimeMs: 200,
      endTimeMs: 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000,
    });
    const nextDay = buildDashboardVolatilityCacheWindow({
      range: "1month",
      startTimeMs: 300,
      endTimeMs: 2 * 24 * 60 * 60 * 1000,
    });

    expect(first).toEqual(sameDay);
    expect(nextDay).not.toEqual(first);
  });

  it("keeps custom cache windows tied to selected minutes", () => {
    const response = buildDashboardVolatilityCacheWindow({
      range: "custom",
      startTimeMs: 60_001,
      endTimeMs: 120_999,
    });

    expect(response).toEqual({
      endMinute: 2,
      range: "custom",
      startMinute: 1,
    });
  });

  it("refreshes cached dashboard volatility every ten minutes", () => {
    const first = getDashboardVolatilityCacheBucket(1);
    const sameWindow = getDashboardVolatilityCacheBucket(10 * 60 * 1000 - 1);
    const nextWindow = getDashboardVolatilityCacheBucket(10 * 60 * 1000);

    expect(first).toBe(sameWindow);
    expect(nextWindow).toBe(first + 1);
  });
});
