import { buildCorrelationGraphData } from "@/components/dev/Coins/correlation-graph";
import { summarizeCoinFinderJobErrors } from "@/components/dev/Coins/job-errors";
import {
  EMPTY_COIN_RESULT_FILTERS,
  filterAndSortCoinResults,
  filterCoinResults,
  filterCoinResultsByTags,
} from "@/components/dev/Coins/result";
import { buildCoinTagFilterAssignment } from "@/components/dev/Coins/tag-filter-assignment";
import {
  analyzeThresholdEntries,
  calculateCoinMonthlyMetrics,
} from "@/components/dev/Coins/threshold-analysis";
import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import {
  computeCoinCorrelationScores,
  computeVolatilityCorrelation,
} from "@/lib/devBacktest/coins/correlation";
import {
  mergeCoinFilterConfigs,
  normalizeCoinFilterConfig,
  pruneCoinFilterConfig,
} from "@/lib/devBacktest/coins/filter-config";
import { summarizeCoinVolatility } from "@/lib/devBacktest/coins/result";
import type { CoinFinderResult } from "@/lib/devBacktest/coins/types";
import { validateFuturesSymbols } from "@/lib/devBacktest/coins/validation";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import { describe, expect, test } from "vitest";

function point(l: "T" | "B", lvl: number, t: number, pct = 5): VolatilityPoint {
  return {
    id: `${l}_${t}`,
    l,
    lvl,
    pct,
    p: 100,
    t,
    vb: 1,
    vq: 100,
  };
}

function result(
  symbol: string,
  maxTop: number,
  maxBottom: number,
): CoinFinderResult {
  return {
    avgBottomToTopMs: 100,
    avgTopToBottomMs: 200,
    cached: false,
    correlationScore: null,
    correlations: {},
    entrySequenceCount: 2,
    entrySignalsPerMonth: 1,
    firstSeen: 1,
    healthReasons: [],
    healthScore: 50,
    holdDurationAvgMs: 200,
    holdDurationMaxMs: 300,
    holdDurationMinMs: 100,
    maxBottom,
    maxBottomT: 2,
    maxBottomToTopMs: 100,
    maxLevelAbsolute: Math.max(maxTop, Math.abs(maxBottom)),
    maxTop,
    maxTopT: 1,
    maxTopToBottomMs: 200,
    marketCapUSD: 1_000_000,
    levelFrequency: {},
    pointCount: 2,
    vPointCloseDistanceOccurrences: 0,
    vPointPctAvg: 5,
    vPointPctMax: 5,
    vPointPctMaxT: 1,
    vPointPctMin: 5,
    vPointsPerMonth: 2,
    vPointTransitionAvgMs: 100,
    vPointTransitionMaxMs: 100,
    vPointTransitionMinMs: 100,
    range: "2year",
    symbol,
  };
}

describe("coin finder", () => {
  test("summarizes first point and level extremes", () => {
    const summary = summarizeCoinVolatility({
      cached: true,
      marketCapUSD: 123_000_000,
      points: [
        point("T", 3, 300),
        point("B", -5, 100),
        point("T", 4, 200),
        point("B", -2, 500),
      ],
      range: "5year",
      symbol: "SOL",
    });

    expect(summary).toMatchObject({
      cached: true,
      avgBottomToTopMs: 100,
      avgTopToBottomMs: 250,
      firstSeen: 100,
      maxBottomToTopMs: 100,
      maxBottom: -5,
      maxBottomT: 100,
      maxLevelAbsolute: 5,
      maxTop: 4,
      maxTopT: 200,
      maxTopToBottomMs: 300,
      marketCapUSD: 123_000_000,
      pointCount: 4,
      vPointCloseDistanceOccurrences: 3,
      vPointPctAvg: 5,
      vPointPctMax: 5,
      vPointPctMin: 5,
      vPointTransitionAvgMs: 400 / 3,
      vPointTransitionMaxMs: 200,
      vPointTransitionMinMs: 100,
    });
    expect(summary.levelFrequency).toMatchObject({
      "-5": 1,
      "-2": 1,
      "3": 1,
      "4": 1,
    });
  });

  test("counts adjacent vPoint distances strictly below 20 minutes", () => {
    const minuteMs = 60 * 1000;
    const summary = summarizeCoinVolatility({
      cached: true,
      marketCapUSD: null,
      points: [
        point("B", -3, 80 * minuteMs),
        point("B", -2, 1 * minuteMs),
        point("T", 3, 20 * minuteMs),
        point("T", 2, 40 * minuteMs),
      ],
      range: "2year",
      symbol: "SOL",
    });

    expect(summary.vPointCloseDistanceOccurrences).toBe(1);
  });

  test("summarizes valid vPoint percentages", () => {
    // BTEST:COIN_FINDER_MAX_VPOINT_PCT_DATE
    const summary = summarizeCoinVolatility({
      cached: true,
      marketCapUSD: null,
      points: [
        point("T", 2, 100, 2.5),
        point("B", -2, 200, 10),
        point("T", 3, 300, Number.NaN),
        point("B", -3, 400, 6),
      ],
      range: "2year",
      symbol: "SOL",
    });

    expect(summary).toMatchObject({
      vPointPctAvg: 18.5 / 3,
      vPointPctMax: 10,
      vPointPctMaxT: 200,
      vPointPctMin: 2.5,
    });
  });

  test("calculates per-coin entry sequence count and hold durations", () => {
    const metrics = calculateCoinMonthlyMetrics({
      maximumLevel: 5,
      minimumLevel: 3,
      points: [
        point("B", -3, 100),
        point("B", -4, 200),
        point("B", 0, 300),
        point("T", 3, 500),
        point("T", 4, 600),
        point("T", 0, 900),
      ],
      symbol: "SOL",
    });

    expect(metrics).toMatchObject({
      entrySequenceCount: 2,
      holdDurationAvgMs: 300,
      holdDurationMaxMs: 400,
      holdDurationMinMs: 200,
    });
  });

  test("combines all cap filters with inclusive AND semantics", () => {
    const filtered = filterAndSortCoinResults({
      direction: "asc",
      filters: {
        ...EMPTY_COIN_RESULT_FILTERS,
        maxBottom: "-2",
        maxLevelAbsolute: "5",
        maxTop: "4",
      },
      results: [
        result("SOL", 3, -3),
        result("EQUAL", 4, -5),
        result("ETH", 5, -3),
        result("BTC", 3, -6),
      ],
      sortKey: "symbol",
    });

    expect(filtered.map((item) => item.symbol)).toEqual(["EQUAL", "SOL"]);
  });

  test("sorts null metrics after numeric values", () => {
    const empty = { ...result("NEW", 0, 0), maxTop: null };
    const sorted = filterAndSortCoinResults({
      direction: "desc",
      filters: EMPTY_COIN_RESULT_FILTERS,
      results: [empty, result("SOL", 4, -3), result("ETH", 2, -2)],
      sortKey: "maxTop",
    });

    expect(sorted.map((item) => item.symbol)).toEqual(["SOL", "ETH", "NEW"]);
  });

  test("filters transition durations in hours before combination selection", () => {
    const fast = {
      ...result("FAST", 3, -3),
      vPointTransitionAvgMs: 2 * 60 * 60 * 1000,
      vPointTransitionMaxMs: 4 * 60 * 60 * 1000,
    };
    const slowAverage = {
      ...result("SLOW_AVG", 3, -3),
      vPointTransitionAvgMs: 6 * 60 * 60 * 1000,
      vPointTransitionMaxMs: 7 * 60 * 60 * 1000,
    };
    const slowMaximum = {
      ...result("SLOW_MAX", 3, -3),
      vPointTransitionAvgMs: 3 * 60 * 60 * 1000,
      vPointTransitionMaxMs: 10 * 60 * 60 * 1000,
    };
    const equalToCap = {
      ...result("EQUAL", 3, -3),
      vPointTransitionAvgMs: 5 * 60 * 60 * 1000,
      vPointTransitionMaxMs: 8 * 60 * 60 * 1000,
    };

    expect(
      filterCoinResults({
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          vPointTransitionAvgHours: "5",
          vPointTransitionMaxHours: "8",
        },
        results: [fast, slowAverage, slowMaximum, equalToCap],
      }).map((item) => item.symbol),
    ).toEqual(["FAST", "EQUAL"]);
  });

  test("filters latest transition averages and maximums in hours", () => {
    const fast = {
      ...result("FAST", 3, -3),
      avgBottomToTopMs: 2 * 60 * 60 * 1000,
      avgTopToBottomMs: 3 * 60 * 60 * 1000,
      maxBottomToTopMs: 4 * 60 * 60 * 1000,
      maxTopToBottomMs: 5 * 60 * 60 * 1000,
    };
    const slowAverage = {
      ...result("SLOW_AVG", 3, -3),
      avgBottomToTopMs: 6 * 60 * 60 * 1000,
      avgTopToBottomMs: 3 * 60 * 60 * 1000,
      maxBottomToTopMs: 4 * 60 * 60 * 1000,
      maxTopToBottomMs: 5 * 60 * 60 * 1000,
    };
    const slowMaximum = {
      ...result("SLOW_MAX", 3, -3),
      avgBottomToTopMs: 2 * 60 * 60 * 1000,
      avgTopToBottomMs: 3 * 60 * 60 * 1000,
      maxBottomToTopMs: 9 * 60 * 60 * 1000,
      maxTopToBottomMs: 5 * 60 * 60 * 1000,
    };
    const equalToCap = {
      ...result("EQUAL", 3, -3),
      avgBottomToTopMs: 5 * 60 * 60 * 1000,
      avgTopToBottomMs: 5 * 60 * 60 * 1000,
      maxBottomToTopMs: 8 * 60 * 60 * 1000,
      maxTopToBottomMs: 8 * 60 * 60 * 1000,
    };

    expect(
      filterCoinResults({
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          avgBottomToTopMaxHours: "5",
          avgTopToBottomMaxHours: "5",
          maxBottomToTopMaxHours: "8",
          maxTopToBottomMaxHours: "8",
        },
        results: [fast, slowAverage, slowMaximum, equalToCap],
      }).map((item) => item.symbol),
    ).toEqual(["FAST", "EQUAL"]);
  });

  test("filters entry sequence count and hold durations", () => {
    const efficient = {
      ...result("EFFICIENT", 3, -3),
      entrySequenceCount: 12,
      holdDurationAvgMs: 4 * 60 * 60 * 1000,
      holdDurationMaxMs: 7 * 60 * 60 * 1000,
      holdDurationMinMs: 1 * 60 * 60 * 1000,
    };
    const rare = {
      ...result("RARE", 3, -3),
      entrySequenceCount: 3,
      holdDurationAvgMs: 4 * 60 * 60 * 1000,
      holdDurationMaxMs: 7 * 60 * 60 * 1000,
      holdDurationMinMs: 1 * 60 * 60 * 1000,
    };
    const locked = {
      ...result("LOCKED", 3, -3),
      entrySequenceCount: 12,
      holdDurationAvgMs: 4 * 60 * 60 * 1000,
      holdDurationMaxMs: 36 * 60 * 60 * 1000,
      holdDurationMinMs: 1 * 60 * 60 * 1000,
    };
    const equalToCap = {
      ...result("EQUAL", 3, -3),
      entrySequenceCount: 10,
      holdDurationAvgMs: 8 * 60 * 60 * 1000,
      holdDurationMaxMs: 24 * 60 * 60 * 1000,
      holdDurationMinMs: 2 * 60 * 60 * 1000,
    };

    expect(
      filterCoinResults({
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          entrySequenceCountMinimum: "10",
          holdDurationAvgMaxHours: "8",
          holdDurationMaxMaxHours: "24",
          holdDurationMinMaxHours: "2",
        },
        results: [efficient, rare, locked, equalToCap],
      }).map((item) => item.symbol),
    ).toEqual(["EFFICIENT", "EQUAL"]);
  });

  test("filters coins by minimum first-vPoint history in calendar months", () => {
    const nowMs = Date.UTC(2026, 5, 22);
    const oldEnough = {
      ...result("OLD", 3, -3),
      firstSeen: Date.UTC(2025, 5, 22),
    };
    const tooNew = {
      ...result("NEW", 3, -3),
      firstSeen: Date.UTC(2025, 6, 1),
    };

    expect(
      filterCoinResults({
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          firstSeenMinimumMonths: "12",
        },
        nowMs,
        results: [oldEnough, tooNew],
      }).map((item) => item.symbol),
    ).toEqual(["OLD"]);
  });

  test("filters unhealthy coins before combination selection", () => {
    const healthy = { ...result("HEALTHY", 3, -3), healthScore: 78 };
    const weak = { ...result("WEAK", 3, -3), healthScore: 42 };
    const unscored = { ...result("NEW", 3, -3), healthScore: null };

    expect(
      filterCoinResults({
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          healthScoreMinimum: "70",
        },
        results: [healthy, weak, unscored],
      }).map((item) => item.symbol),
    ).toEqual(["HEALTHY"]);
  });

  test("filters minimum monthly entry signals and vPoint frequency", () => {
    const active = {
      ...result("ACTIVE", 3, -3),
      entrySignalsPerMonth: 2.5,
      vPointsPerMonth: 18,
    };
    const rareEntries = {
      ...result("RARE", 3, -3),
      entrySignalsPerMonth: 0.5,
      vPointsPerMonth: 20,
    };
    const rareVPoints = {
      ...result("SPARSE", 3, -3),
      entrySignalsPerMonth: 3,
      vPointsPerMonth: 5,
    };

    expect(
      filterCoinResults({
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          entrySignalsPerMonthMinimum: "2",
          vPointsPerMonthMinimum: "10",
        },
        results: [active, rareEntries, rareVPoints],
      }).map((item) => item.symbol),
    ).toEqual(["ACTIVE"]);
  });

  test("filters coins having all selected tags before combination selection", () => {
    expect(
      filterCoinResultsByTags({
        coinTags: {
          ETH: ["Reviewed"],
          SOL: ["Reviewed", "Low Risk"],
        },
        requiredTags: ["reviewed", "LOW RISK"],
        results: [result("SOL", 3, -3), result("ETH", 3, -3)],
      }).map((item) => item.symbol),
    ).toEqual(["SOL"]);
  });

  test("prunes symbols without Binance Futures klines", async () => {
    const checked: string[] = [];
    const validation = await validateFuturesSymbols({
      getKlines: async (symbol) => {
        if (symbol === "BAD") throw new Error("Invalid symbol");
        return [
          [
            Date.now(),
            "1",
            "1",
            "1",
            "1",
            "1",
            Date.now(),
            "1",
            1,
            "1",
            "1",
            "0",
            "now",
          ],
        ] as Kline[];
      },
      onProgress: (_completed, symbol) => checked.push(symbol),
      symbols: ["SOL", "BAD", "ETH"],
    });

    expect(validation.valid).toEqual(["SOL", "ETH"]);
    expect(validation.invalid).toEqual([
      {
        message: "Not available as a Binance USDT Futures symbol",
        symbol: "BAD",
      },
    ]);
    expect(checked).toEqual(["SOL", "BAD", "ETH"]);
  });

  test("groups repeated job warnings for dashboard display", () => {
    const summaries = summarizeCoinFinderJobErrors(
      [
        {
          message: "Not available as a Binance USDT Futures symbol",
          symbol: "ACS",
        },
        {
          message: "Not available as a Binance USDT Futures symbol",
          symbol: "AMP",
        },
        {
          message: "No recent Binance Futures klines found",
          symbol: "NEW",
        },
      ],
      1,
    );

    expect(summaries).toEqual([
      {
        count: 2,
        hiddenCount: 1,
        key: "Not available as a Binance USDT Futures symbol",
        message: "Not available as a Binance USDT Futures symbol",
        symbols: ["ACS", "AMP"],
        visibleSymbols: ["ACS"],
      },
      {
        count: 1,
        hiddenCount: 0,
        key: "No recent Binance Futures klines found",
        message: "No recent Binance Futures klines found",
        symbols: ["NEW"],
        visibleSymbols: ["NEW"],
      },
    ]);
  });

  test("merges tag filter configs into stricter current filter JSON", () => {
    const merged = mergeCoinFilterConfigs(
      {
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          healthScoreMinimum: "50",
          holdDurationMaxMaxHours: "48",
          maxLevelAbsolute: "8",
        },
        requiredTags: ["Reviewed"],
      },
      [
        {
          filters: {
            ...EMPTY_COIN_RESULT_FILTERS,
            healthScoreMinimum: "70",
            holdDurationMaxMaxHours: "24",
            maxLevelAbsolute: "6",
          },
          requiredTags: ["Low Risk"],
        },
      ],
    );

    expect(merged).toMatchObject({
      filters: {
        healthScoreMinimum: "70",
        holdDurationMaxMaxHours: "24",
        maxLevelAbsolute: "6",
      },
      requiredTags: ["Reviewed", "Low Risk"],
    });
  });

  test("prunes default values from current filter JSON", () => {
    expect(
      pruneCoinFilterConfig({
        filters: {
          ...EMPTY_COIN_RESULT_FILTERS,
          holdDurationMaxMaxHours: "24",
          maxLevelAbsolute: "6",
        },
        requiredTags: ["Reviewed"],
      }),
    ).toEqual({
      holdDurationMaxMaxHours: "24",
      maxLevelAbsolute: "6",
      requiredTags: ["Reviewed"],
    });
  });

  test("parses flat tag filter JSON", () => {
    expect(
      normalizeCoinFilterConfig({
        firstSeenMinimumMonths: "6",
        holdDurationAvgMaxHours: "48",
        holdDurationMaxMaxHours: "168",
        maxLevelAbsolute: "6",
        requiredTags: ["max abs level 5"],
        vPointTransitionAvgHours: "30",
      }),
    ).toMatchObject({
      filters: {
        firstSeenMinimumMonths: "6",
        holdDurationAvgMaxHours: "48",
        holdDurationMaxMaxHours: "168",
        maxLevelAbsolute: "6",
        vPointTransitionAvgHours: "30",
      },
      requiredTags: ["max abs level 5"],
    });
  });

  test("assigns tags to current run symbols that pass tag filter JSON", () => {
    const fast = {
      ...result("SOL", 5, -3),
      holdDurationMaxMs: 12 * 60 * 60 * 1000,
    };
    const tooWide = {
      ...result("ETH", 7, -3),
      holdDurationMaxMs: 12 * 60 * 60 * 1000,
    };
    const alreadyReviewed = {
      ...result("BTC", 5, -3),
      holdDurationMaxMs: 12 * 60 * 60 * 1000,
    };

    const assignment = buildCoinTagFilterAssignment({
      coinTags: {
        BTC: ["Reviewed"],
        ETH: ["Fast"],
      },
      results: [fast, tooWide, alreadyReviewed],
      tags: [
        {
          color: "#1976d2",
          coins: [],
          description: "",
          filters: {
            filters: {
              ...EMPTY_COIN_RESULT_FILTERS,
              holdDurationMaxMaxHours: "24",
              maxLevelAbsolute: "5",
            },
            requiredTags: [],
          },
          tagId: 1,
          text: "Fast",
        },
      ],
    });

    expect(assignment.changed).toBe(true);
    expect(assignment.coinTags).toMatchObject({
      BTC: ["Reviewed", "Fast"],
      ETH: [],
      SOL: ["Fast"],
    });
  });

  test("keeps only the strictest matching numbered tag family assignment", () => {
    const levelFive = result("AIA", 5, -4);
    const levelSeven = result("WIDE", 7, -4);

    const assignment = buildCoinTagFilterAssignment({
      coinTags: {
        AIA: ["max abs level 6", "max abs level 7", "Manual"],
        WIDE: ["max abs level 5"],
      },
      results: [levelFive, levelSeven],
      tags: [
        {
          color: "#00ff00",
          coins: [],
          description: "",
          filters: {
            filters: {
              ...EMPTY_COIN_RESULT_FILTERS,
              maxLevelAbsolute: "5",
            },
            requiredTags: [],
          },
          tagId: 1,
          text: "max abs level 5",
        },
        {
          color: "#ffff00",
          coins: [],
          description: "",
          filters: {
            filters: {
              ...EMPTY_COIN_RESULT_FILTERS,
              maxLevelAbsolute: "6",
            },
            requiredTags: [],
          },
          tagId: 2,
          text: "max abs level 6",
        },
        {
          color: "#ff0000",
          coins: [],
          description: "",
          filters: {
            filters: {
              ...EMPTY_COIN_RESULT_FILTERS,
              maxLevelAbsolute: "7",
            },
            requiredTags: [],
          },
          tagId: 3,
          text: "max abs level 7",
        },
      ],
    });

    expect(assignment.changed).toBe(true);
    expect(assignment.coinTags).toMatchObject({
      AIA: ["Manual", "max abs level 5"],
      WIDE: ["max abs level 7"],
    });
  });

  test("assigns filter tags that depend on other filter tags in the same run", () => {
    const levelFiveFast = {
      ...result("AIA", 5, -4),
      holdDurationAvgMs: 24 * 60 * 60 * 1000,
    };

    const assignment = buildCoinTagFilterAssignment({
      coinTags: {},
      results: [levelFiveFast],
      tags: [
        {
          color: "#00ff00",
          coins: [],
          description: "",
          filters: {
            filters: {
              ...EMPTY_COIN_RESULT_FILTERS,
              maxLevelAbsolute: "5",
            },
            requiredTags: [],
          },
          tagId: 1,
          text: "max abs level 5",
        },
        {
          color: "#ff6d00",
          coins: [],
          description: "",
          filters: {
            filters: {
              ...EMPTY_COIN_RESULT_FILTERS,
              holdDurationAvgMaxHours: "48",
            },
            requiredTags: ["max abs level 5"],
          },
          tagId: 2,
          text: "Speed Tier 2",
        },
      ],
    });

    expect(assignment.changed).toBe(true);
    expect(assignment.coinTags).toMatchObject({
      AIA: ["max abs level 5", "Speed Tier 2"],
    });
  });

  test("stops symbol validation after cancellation", async () => {
    let cancelled = false;
    const validation = await validateFuturesSymbols({
      getKlines: async () => {
        cancelled = true;
        return [];
      },
      isCancelled: () => cancelled,
      onProgress: () => undefined,
      symbols: ["SOL", "ETH"],
    });

    expect(validation.invalid.map((item) => item.symbol)).toEqual(["SOL"]);
  });

  test("aborts a kline download before requesting Binance", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchKlinesFunction({
        exchangeType: "binance",
        interval: "5m",
        marketType: "FUTURES",
        signal: controller.signal,
        simpleTime: "6month",
        symbol: "BTC_USDT",
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("scores matching vPoint level movement close to one", () => {
    const day = 24 * 60 * 60 * 1000;
    const sol = [
      point("B", -2, day),
      point("T", 2, day * 3),
      point("B", -1, day * 5),
      point("T", 3, day * 7),
    ];
    const eth = sol.map((item) => ({ ...item, symbol: "ETH" }));

    expect(computeVolatilityCorrelation(sol, eth)).toBeCloseTo(1, 8);
    expect(
      computeCoinCorrelationScores({ ETH: eth, SOL: sol }).SOL.score,
    ).toBeCloseTo(1, 8);
  });

  test("clamps inverse vPoint movement to zero", () => {
    const day = 24 * 60 * 60 * 1000;
    const sol = [
      point("B", -2, day),
      point("T", 2, day * 3),
      point("B", -1, day * 5),
    ];
    const inverse = sol.map((item) => ({ ...item, lvl: -item.lvl }));

    expect(computeVolatilityCorrelation(sol, inverse)).toBe(0);
  });

  test("builds one 3D graph link per unique correlation pair", () => {
    const a = {
      ...result("A", 2, -2),
      correlationScore: 0.7,
      correlations: { B: 0.8, C: 0.6 },
    };
    const b = {
      ...result("B", 2, -2),
      correlationScore: 0.8,
      correlations: { A: 0.8, C: 0.7 },
    };
    const c = {
      ...result("C", 2, -2),
      correlationScore: 0.65,
      correlations: { A: 0.6, B: 0.7 },
    };
    const graph = buildCorrelationGraphData([a, b, c], ["red", "blue"]);

    expect(graph.nodes.map((node) => node.id)).toEqual(["A", "B", "C"]);
    expect(graph.links).toHaveLength(3);
    expect(graph.links.map((link) => link.score).sort()).toEqual([
      0.6, 0.7, 0.8,
    ]);
  });

  test("selects one threshold entry per sequence and counts monthly totals", () => {
    const at = (month: number, day: number) => Date.UTC(2026, month, day);
    const levelPoint = (lvl: number, t: number) =>
      point(lvl > 0 ? "T" : "B", lvl, t);
    const analysis = analyzeThresholdEntries({
      maximumLevel: 4,
      minimumLevel: 2,
      volatilityMap: {
        ETH: [
          levelPoint(0, at(0, 1)),
          levelPoint(2, at(0, 10)),
          levelPoint(3, at(0, 11)),
          levelPoint(0, at(0, 12)),
        ],
        SOL: [
          levelPoint(0, at(0, 1)),
          levelPoint(1, at(0, 2)),
          levelPoint(2, at(0, 3)),
          levelPoint(4, at(0, 4)),
          levelPoint(5, at(0, 5)),
          levelPoint(0, at(0, 6)),
          levelPoint(-1, at(1, 2)),
          levelPoint(-2, at(1, 3)),
          levelPoint(-5, at(1, 4)),
          levelPoint(0, at(1, 5)),
          levelPoint(5, at(2, 2)),
          levelPoint(0, at(2, 3)),
        ],
      },
    });

    expect(
      analysis.entries.map((entry) => [
        entry.symbol,
        entry.direction,
        entry.point.lvl,
      ]),
    ).toEqual([
      ["SOL", "SHORT", 2],
      ["ETH", "SHORT", 2],
      ["SOL", "LONG", -2],
    ]);
    expect(analysis.monthlyEntries.map((month) => month.count)).toEqual([
      2, 1, 0,
    ]);
    expect(analysis.maximumEntriesPerMonth).toBe(2);
    expect(analysis.averageEntriesPerMonth).toBe(1);
    expect(analysis.minimumEntriesPerMonth).toBe(0);
    expect(analysis.exceededSequenceCount).toBe(3);
  });

  test("calculates per-coin monthly entry and vPoint averages", () => {
    const at = (month: number, day: number) => Date.UTC(2026, month, day);
    const points = [
      point("T", 0, at(0, 1)),
      point("T", 2, at(0, 2)),
      point("T", 0, at(0, 3)),
      point("B", -2, at(2, 2)),
      point("B", 0, at(2, 3)),
      point("T", 1, at(2, 4)),
    ];

    expect(
      calculateCoinMonthlyMetrics({
        maximumLevel: 4,
        minimumLevel: 2,
        points,
        symbol: "SOL",
      }),
    ).toMatchObject({
      entrySequenceCount: 2,
      entrySignalsPerMonth: 2 / 3,
      holdDurationAvgMs: 24 * 60 * 60 * 1000,
      holdDurationMaxMs: 24 * 60 * 60 * 1000,
      holdDurationMinMs: 24 * 60 * 60 * 1000,
      vPointsPerMonth: 2,
    });
  });
});
