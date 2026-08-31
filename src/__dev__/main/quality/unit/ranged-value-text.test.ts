import {
  pickRangedValueColor,
  type RangedValueColorRange,
} from "@/components/LiveDashboard/Reporting/RangedValueText";

describe("ranged value text", () => {
  it("picks colors from numeric ranges with inclusive boundaries", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const ranges: RangedValueColorRange[] = [
      { color: "success.main", max: dayMs },
      {
        color: "warning.main",
        max: dayMs * 2,
        maxInclusive: true,
        min: dayMs,
      },
      { color: "error.main", min: dayMs * 2, minInclusive: false },
    ];

    expect(
      pickRangedValueColor({ ranges, value: dayMs - 1 }),
    ).toBe("success.main");
    expect(pickRangedValueColor({ ranges, value: dayMs })).toBe(
      "warning.main",
    );
    expect(pickRangedValueColor({ ranges, value: dayMs * 2 })).toBe(
      "warning.main",
    );
    expect(
      pickRangedValueColor({ ranges, value: dayMs * 2 + 1 }),
    ).toBe("error.main");
  });

  it("supports low percent warning and error thresholds", () => {
    const ranges: RangedValueColorRange[] = [
      { color: "error.main", max: 30 },
      { color: "warning.main", max: 40, min: 30 },
    ];

    expect(pickRangedValueColor({ ranges, value: 29.99 })).toBe("error.main");
    expect(pickRangedValueColor({ ranges, value: 30 })).toBe("warning.main");
    expect(pickRangedValueColor({ ranges, value: 39.99 })).toBe(
      "warning.main",
    );
    expect(pickRangedValueColor({ ranges, value: 40 })).toBe(
      "text.secondary",
    );
  });
});
