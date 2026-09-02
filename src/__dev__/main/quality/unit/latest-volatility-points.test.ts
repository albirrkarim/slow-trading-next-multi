import {
  buildConfiguredCoinTagComposition,
  buildConfiguredCoinTagCompositionGroups,
  countConfiguredVolatilityPointLabels,
  countVolatilityPointLabels,
  countVolatilityLevels,
  describeFundingRatePayer,
  formatFundingRatePct,
  formatFundingRateUpdatedAt,
  getLatestVolatilityPointColumnHelp,
  formatMarketCapUpdatedAt,
  formatVolume24h,
  getMissingVolatilitySymbols,
  isLowVolume24h,
  matchesLatestVolatilitySymbolSearch,
} from "@/components/LiveDashboard/Feature/LatestVolatilityPoints";
import {
  buildVPointLevelMaxDrawdownTooltip,
  calculateVPointLevelHeatPct,
  calculateVPointLevelProgressionPct,
  countRangedVPointLevelFrequency,
  getVPointLevelProgressions,
  summarizeVPointLevelMaxDrawdowns,
  summarizeRangedVPoints,
} from "@/components/LiveDashboard/Feature/VPointsFrequency";
import {
  buildOpenPositionFundingTooltip,
  describePositionFundingImpact,
} from "@/components/LiveDashboard/Feature/OpenPositionFundingRate";
import { describe, expect, it } from "vitest";

describe("latest volatility point volume", () => {
  it("marks only finite 24h volumes below $1M as low volume", () => {
    // PROD:LATEST_VOLATILITY_VOLUME_24H
    expect(isLowVolume24h(999_999)).toBe(true);
    expect(isLowVolume24h(1_000_000)).toBe(false);
    expect(isLowVolume24h(undefined)).toBe(true);
    expect(isLowVolume24h(Number.NaN)).toBe(false);
  });

  it("formats missing volume neutrally", () => {
    expect(formatVolume24h(undefined)).toBe("—");
  });

  it("formats the market-cap cache update time below its value", () => {
    // PROD:MARKET_CAP_UPDATED_AT
    expect(formatMarketCapUpdatedAt(undefined)).toBe("Updated: unknown");
    expect(formatMarketCapUpdatedAt(Date.UTC(2026, 7, 9, 2, 10))).toMatch(
      /^Updated \d{2} \w{3} 2026 \d{2}:\d{2}$/,
    );
  });

  it("formats funding direction and Binance's update timestamp", () => {
    // PROD:LATEST_VOLATILITY_FUNDING_RATE
    expect(formatFundingRatePct(-0.0005)).toBe("-0.0500%");
    expect(formatFundingRatePct(0.0001)).toBe("+0.0100%");
    expect(formatFundingRatePct(undefined)).toBe("—");
    expect(describeFundingRatePayer(-0.0005)).toBe("SHORT pays");
    expect(describeFundingRatePayer(0.0001)).toBe("LONG pays");
    expect(formatFundingRateUpdatedAt(undefined)).toBe("Updated: unknown");
    expect(formatFundingRateUpdatedAt(Date.UTC(2026, 7, 9, 2, 10))).toMatch(
      /^Updated \d{2} \w{3} 2026 \d{2}:\d{2}$/,
    );
  });

  it("explains the meaning and source of every latest-table column", () => {
    // PROD:LATEST_VOLATILITY_COLUMN_HELP
    const help = getLatestVolatilityPointColumnHelp(3);

    expect(help).toHaveLength(10);
    expect(help.every((column) => column.meaning && column.source)).toBe(true);
    expect(help.find((column) => column.key === "entrySequence")?.meaning).toContain(
      "at least 3",
    );
    expect(help.find((column) => column.key === "fundingRate")).toMatchObject({
      meaning: expect.stringMatching(
        /crowded LONG.*LONG pays SHORT.*crowded SHORT.*SHORT pays LONG/,
      ),
      source: expect.stringContaining("Binance USD-M"),
    });
  });

  it("explains funding impact for the current open-position direction", () => {
    // PROD:OPEN_POSITION_FUNDING_RATE_UI
    expect(describePositionFundingImpact("SHORT", -0.0005)).toBe(
      "SHORT pays",
    );
    expect(describePositionFundingImpact("SHORT", 0.0005)).toBe(
      "SHORT receives",
    );
    expect(
      buildOpenPositionFundingTooltip({
        direction: "SHORT",
        funding: {
          exchange: "binance",
          nextT: Date.UTC(2026, 7, 9, 8),
          rate: -0.0005,
          t: Date.UTC(2026, 7, 9, 0),
        },
      }),
    ).toMatch(/crowded.*SHORT pays LONG.*This position: SHORT pays/);
  });

  it("finds configured coins without loaded volatility points", () => {
    expect(
      getMissingVolatilitySymbols({
        configuredSymbols: ["DAR", "FIS", "KEY", "SUI", "sui"],
        volatilityMap: {
          DAR: [],
          KEY: [],
          SUI: [{ t: 1, p: 1 } as any],
        },
      }),
    ).toEqual(["DAR", "FIS", "KEY"]);
  });

  it("counts latest table frequency by volatility level", () => {
    expect(
      countVolatilityLevels([
        { lvl: 3 } as any,
        { lvl: 3 } as any,
        { lvl: -4 } as any,
        { lvl: 0 } as any,
        { lvl: Number.NaN } as any,
      ]),
    ).toEqual({
      "-4": 1,
      "0": 1,
      "3": 2,
    });
  });

  it("counts ranged vPoints from the current maximum through minimum level", () => {
    // PROD:VPOINTS_FREQUENCY
    expect(
      countRangedVPointLevelFrequency({
        endTime: 200,
        startTime: 100,
        volatilityMap: {
          BTC: [
            { lvl: 8, t: 99 } as any,
            { lvl: 3, t: 100 } as any,
            { lvl: 3, t: 110 } as any,
            { lvl: 1, t: 120 } as any,
            { lvl: -3, t: 130 } as any,
          ],
          ETH: [
            { lvl: 2, t: 140 } as any,
            { lvl: 0, t: 150 } as any,
            { lvl: -1, t: 160 } as any,
            { lvl: Number.NaN, t: 170 } as any,
            { lvl: -7, t: 201 } as any,
          ],
        },
      }),
    ).toEqual([
      { count: 2, level: 3 },
      { count: 1, level: 2 },
      { count: 1, level: 1 },
      { count: 1, level: 0 },
      { count: 1, level: -1 },
      { count: 0, level: -2 },
      { count: 1, level: -3 },
    ]);
  });

  it("summarizes vPoint percentages inside the current dashboard range", () => {
    // PROD:VPOINTS_SUMMARY_PCT
    expect(
      summarizeRangedVPoints({
        endTime: 200,
        startTime: 100,
        volatilityMap: {
          BTC: [
            { lvl: 1, pct: 99, t: 99 } as any,
            { lvl: 1, pct: 2, t: 100 } as any,
            { lvl: 0, pct: 4, t: 150 } as any,
          ],
          ETH: [
            { lvl: -1, pct: 6, t: 200 } as any,
            { lvl: -2, pct: 101, t: 201 } as any,
            { lvl: -2, pct: Number.NaN, t: 175 } as any,
          ],
        },
      }),
    ).toEqual({
      frequencies: [
        { count: 1, level: 1 },
        { count: 1, level: 0 },
        { count: 1, level: -1 },
        { count: 1, level: -2 },
      ],
      pct: { avg: 4, max: 6, min: 2 },
      total: 4,
    });
  });

  it("calculates floored progression percentages toward the next level", () => {
    // PROD:VPOINTS_FREQUENCY
    expect(
      calculateVPointLevelProgressionPct({
        count: 131,
        lowerCount: 659,
      }),
    ).toBe(19);
    expect(
      calculateVPointLevelProgressionPct({
        count: 154,
        lowerCount: 679,
      }),
    ).toBe(22);
    expect(
      calculateVPointLevelProgressionPct({
        count: 3,
        lowerCount: 0,
      }),
    ).toBeNull();
  });

  it("scales level heat widths against the highest count", () => {
    // PROD:VPOINTS_FREQUENCY
    expect(
      calculateVPointLevelHeatPct({ count: 1_477, maximumCount: 1_477 }),
    ).toBe(100);
    expect(
      calculateVPointLevelHeatPct({ count: 793, maximumCount: 1_477 }),
    ).toBeCloseTo((793 / 1_477) * 100);
    expect(calculateVPointLevelHeatPct({ count: 0, maximumCount: 1_477 })).toBe(
      0,
    );
  });

  it("attaches outward progression to its source level", () => {
    // PROD:VPOINTS_FREQUENCY
    const countByLevel = new Map([
      [-2, 154],
      [-1, 679],
      [0, 1_351],
      [1, 659],
      [2, 131],
    ]);

    expect(getVPointLevelProgressions({ countByLevel, level: 1 })).toEqual([
      {
        direction: "up",
        exactPct: expect.closeTo((131 / 659) * 100),
        pct: 19,
        targetCount: 131,
        targetLevel: 2,
      },
    ]);
    expect(getVPointLevelProgressions({ countByLevel, level: 0 })).toEqual([
      {
        direction: "up",
        exactPct: expect.closeTo((659 / 1_351) * 100),
        pct: 48,
        targetCount: 659,
        targetLevel: 1,
      },
      {
        direction: "down",
        exactPct: expect.closeTo((679 / 1_351) * 100),
        pct: 50,
        targetCount: 679,
        targetLevel: -1,
      },
    ]);
    expect(getVPointLevelProgressions({ countByLevel, level: -1 })).toEqual([
      {
        direction: "down",
        exactPct: expect.closeTo((154 / 679) * 100),
        pct: 22,
        targetCount: 154,
        targetLevel: -2,
      },
    ]);
  });

  it("summarizes each level from its next outward-level pct values", () => {
    // PROD:VPOINTS_LEVEL_MAX_DD
    const metrics = summarizeVPointLevelMaxDrawdowns([
      { lvl: 2, pct: 6 },
      { lvl: 2, pct: 8 },
      { lvl: 3, pct: 10 },
      { lvl: 1, pct: 2 },
      { lvl: -1, pct: 3 },
      { lvl: -2, pct: 4 },
      { lvl: -2, pct: 6 },
      { lvl: 0, pct: 99 },
      { lvl: 2, pct: Number.NaN },
    ]);

    expect(metrics.get(1)).toEqual({
      avg: 7,
      count: 2,
      max: 8,
      min: 6,
      targetLevels: [2],
    });
    expect(metrics.get(2)).toEqual({
      avg: 10,
      count: 1,
      max: 10,
      min: 10,
      targetLevels: [3],
    });
    expect(metrics.get(0)).toEqual({
      avg: 2.5,
      count: 2,
      max: 3,
      min: 2,
      targetLevels: [1, -1],
    });
    expect(metrics.get(-1)).toEqual({
      avg: 5,
      count: 2,
      max: 6,
      min: 4,
      targetLevels: [-2],
    });
    expect(metrics.has(3)).toBe(false);
  });

  it("explains the source level and sample count for Max DD", () => {
    // PROD:VPOINTS_LEVEL_MAX_DD
    expect(
      buildVPointLevelMaxDrawdownTooltip(1, {
        avg: 7,
        count: 2,
        max: 8,
        min: 6,
        targetLevels: [2],
      }),
    ).toContain(
      "Level 1 Max DD uses pct from Level 2 vPoints in the selected range",
    );
    expect(buildVPointLevelMaxDrawdownTooltip(3)).toContain(
      "no matching vPoints",
    );
  });

  it("counts latest table TOP and DOWN percentages from ranged vPoints", () => {
    const result = countVolatilityPointLabels([
      { l: "T" } as any,
      { l: "T" } as any,
      { l: "B" } as any,
      { l: "X" } as any,
    ]);

    expect(result).toMatchObject({
      downCount: 1,
      topCount: 2,
    });
    expect(result.downPct).toBeCloseTo(100 / 3);
    expect(result.topPct).toBeCloseTo(200 / 3);
  });

  it("counts TOP and DOWN percentages across configured ranged vPoints", () => {
    const result = countConfiguredVolatilityPointLabels({
      configuredSymbols: ["btc", "ETH"],
      volatilityMap: {
        BTC: [{ l: "T" }, { l: "B" }] as any,
        ETH: [{ l: "T" }] as any,
        XRP: [{ l: "B" }, { l: "B" }, { l: "B" }] as any,
      },
    });

    expect(result).toMatchObject({
      downCount: 1,
      topCount: 2,
    });
    expect(result.downPct).toBeCloseTo(100 / 3);
    expect(result.topPct).toBeCloseTo(200 / 3);
  });

  it("counts configured coin tag composition case-insensitively", () => {
    expect(
      buildConfiguredCoinTagComposition({
        coinTags: {
          BTC: ["Speed Tier 1", "Dying", "Dying"],
          eth: ["Speed Tier 1"],
          XRP: ["Ignored"],
        },
        configuredSymbols: ["btc", "ETH", "SOL", "BTC"],
        tagColors: {
          dying: "#ef4444",
          "speed tier 1": "#22c55e",
        },
      }),
    ).toEqual([
      { color: "#22c55e", count: 2, name: "Speed Tier 1" },
      { color: "#ef4444", count: 1, name: "Dying" },
      { color: "#9ca3af", count: 1, name: "Untagged" },
    ]);
  });

  it("splits numbered tier tag families into separate composition groups", () => {
    const groups = buildConfiguredCoinTagCompositionGroups({
      coinTags: {
        ADA: ["tier1", "max abs level 5"],
        BTC: [
          "Speed Tier 1",
          "Utility tier 2",
          "Utility tier 3",
          "at least 12 month yo",
          "dying",
        ],
        ETH: ["Speed Tier 2", "Utility tier 1", "Utility tier 3", "at least 6 month yo"],
        SOL: ["max abs level 7", "tier 2"],
      },
      configuredSymbols: ["BTC", "ETH", "SOL", "ADA", "DOGE"],
      tagColors: {
        "at least 12 month yo": "#2563eb",
        "at least 6 month yo": "#f59e0b",
        dying: "#ef4444",
        "max abs level 5": "#22c55e",
        "max abs level 7": "#ef4444",
        "speed tier 1": "#2563eb",
        "speed tier 2": "#60a5fa",
        tier1: "#fbbf24",
        "tier 2": "#f59e0b",
        "utility tier 1": "#22c55e",
        "utility tier 2": "#84cc16",
        "utility tier 3": "#a3e635",
      },
    });
    const groupByName = Object.fromEntries(
      groups.map((group) => [
        group.name,
        {
          items: group.items.map((item) => item.name),
          labels: group.items.map((item) => item.label ?? item.name),
          total: group.total,
        },
      ]),
    );

    expect(groupByName["Utility tier"]).toEqual({
      items: ["Utility tier 1", "Utility tier 2", "Utility tier 3"],
      labels: ["1", "2", "3"],
      total: 4,
    });
    expect(groupByName["at least month yo"]).toEqual({
      items: ["at least 6 month yo", "at least 12 month yo"],
      labels: ["6", "12"],
      total: 2,
    });
    expect(groupByName["max abs level"]).toEqual({
      items: ["max abs level 5", "max abs level 7"],
      labels: ["5", "7"],
      total: 2,
    });
    expect(groupByName["Speed Tier"]).toEqual({
      items: ["Speed Tier 1", "Speed Tier 2"],
      labels: ["1", "2"],
      total: 2,
    });
    expect(groupByName.tier).toEqual({
      items: ["tier1", "tier 2"],
      labels: ["1", "2"],
      total: 2,
    });
    expect(groupByName.Other).toEqual({
      items: ["dying", "Untagged"],
      labels: ["dying", "Untagged"],
      total: 2,
    });
  });

  it("splits colon tag families by prefix into separate composition groups", () => {
    const groups = buildConfiguredCoinTagCompositionGroups({
      coinTags: {
        ADA: ["PROD:HOLY"],
        BTC: ["PROD:FAST"],
        ETH: ["PROD:HOLY", "dying"],
        SOL: ["dying"],
      },
      configuredSymbols: ["BTC", "ETH", "SOL", "ADA"],
      tagColors: {
        dying: "#ef4444",
        "prod:fast": "#22c55e",
        "prod:holy": "#2563eb",
      },
    });
    const groupByName = Object.fromEntries(
      groups.map((group) => [
        group.name,
        {
          items: group.items.map((item) => item.name),
          labels: group.items.map((item) => item.label ?? item.name),
          total: group.total,
        },
      ]),
    );

    // PROD:LATEST_VOLATILITY_TAG_COMPOSITION
    expect(groupByName.PROD).toEqual({
      items: ["PROD:HOLY", "PROD:FAST"],
      labels: ["HOLY", "FAST"],
      total: 3,
    });
    expect(groupByName.Other).toEqual({
      items: ["dying"],
      labels: ["dying"],
      total: 2,
    });
  });

  it("matches latest table symbol search case-insensitively", () => {
    // PROD:LATEST_VOLATILITY_SYMBOL_SEARCH
    expect(
      matchesLatestVolatilitySymbolSearch({
        search: " atom ",
        symbol: "ATOM",
      }),
    ).toBe(true);
    expect(
      matchesLatestVolatilitySymbolSearch({
        search: "to",
        symbol: "ATOM",
      }),
    ).toBe(true);
    expect(
      matchesLatestVolatilitySymbolSearch({
        search: "btc",
        symbol: "ATOM",
      }),
    ).toBe(false);
  });

  it("matches latest table CSV symbol search as an exact symbol list", () => {
    const search =
      "AIXBT, APT, COW, CYS, DEXE, ENS, GRT, HYPER, IOTX, LUMIA, MOVR, PHA, SCR, SPX, ZBT, ZRO";

    // PROD:LATEST_VOLATILITY_SYMBOL_SEARCH
    expect(
      matchesLatestVolatilitySymbolSearch({
        search,
        symbol: "AIXBT",
      }),
    ).toBe(true);
    expect(
      matchesLatestVolatilitySymbolSearch({
        search,
        symbol: "zro",
      }),
    ).toBe(true);
    expect(
      matchesLatestVolatilitySymbolSearch({
        search,
        symbol: "AI",
      }),
    ).toBe(false);
    expect(
      matchesLatestVolatilitySymbolSearch({
        search,
        symbol: "ATOM",
      }),
    ).toBe(false);
  });
});
