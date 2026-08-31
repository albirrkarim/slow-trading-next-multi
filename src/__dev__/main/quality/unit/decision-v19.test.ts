import {
  buildSpeedTierBySymbolFromCoinTags,
  evaluateRecommendationsV19,
  getRecommendationsV19,
} from "@/lib/brain/algorithms/v4/decisions/v19/recommendations";
import { decisionEngineLevelConfig } from "@/lib/brain/algorithms/v4/decisions/v19/constants";
import type { VolatilityPoint } from "@/lib/dynamic";
import type { IExchange } from "@/lib/exchange";
import type { Kline } from "@/lib/exchange/platform/tokocrypto";
import { describe, expect, it } from "vitest";

const HOUR_MS = 60 * 60 * 1_000;
const BASE_TIME = Date.UTC(2026, 6, 1, 13, 0);

function point(
  symbol: string,
  overrides: Partial<VolatilityPoint>,
): VolatilityPoint {
  const lvl = overrides.lvl ?? 1;

  return {
    id: `${symbol}_${lvl}_${overrides.t ?? BASE_TIME}`,
    l: lvl > 0 ? "T" : "B",
    lvl,
    p: overrides.p ?? 100,
    pct: overrides.pct ?? lvl * 5,
    t: overrides.t ?? BASE_TIME,
    vb: 1,
    vq: 1,
    ...overrides,
  } as VolatilityPoint;
}

function kline(symbol: string, time: number, close: number): Kline {
  return [
    time,
    String(close),
    String(close),
    String(close),
    String(close),
    "1",
    time + 5 * 60 * 1_000 - 1,
    "1",
    1,
    "1",
    "1",
    "",
    symbol,
  ];
}

describe("decision.v19 speed timing", () => {
  it("defaults the minimum actionable level to 2 and accepts 1", () => {
    // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
    expect(decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel()).toBe(
      2,
    );
    expect(decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(2)).toBe(
      2,
    );
    expect(decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(1)).toBe(
      1,
    );
    expect(decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(0)).toBe(
      1,
    );
    expect(decisionEngineLevelConfig.resolveMinActionableAbsoluteLevel(4)).toBe(
      4,
    );
  });

  it("enters at absolute level 1 when configured", async () => {
    const recommendations = await getRecommendationsV19({
      bypass: true,
      minActionableAbsoluteLevel: 1,
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      speedTierBySymbol: buildSpeedTierBySymbolFromCoinTags({
        AIXBT: ["Speed Tier 1"],
      }),
      volatilityPointsMap: {
        AIXBT: [
          point("AIXBT", {
            lvl: -1,
            p: 100,
            t: BASE_TIME,
          }),
        ],
      },
    });

    // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].symbol).toBe("AIXBT");
    expect(recommendations[0].lvl).toBe(-1);
  });

  it("builds speed tiers from coin metadata tags", () => {
    // PROD:DECISION_V19_SPEED_TIER
    expect(
      buildSpeedTierBySymbolFromCoinTags({
        AIXBT: ["Speed Tier 1", "Momentum"],
        AKT: ["speed tier 2"],
        TAO: ["Tier 3"],
        ZRO: ["Reviewed"],
      }),
    ).toEqual({
      AIXBT: 1,
      AKT: 2,
      TAO: 3,
    });
  });

  it("waits when a level-2 speed-tier coin projects a faster exit than the current level-3 coin", async () => {
    const evaluation = await evaluateRecommendationsV19({
      bypass: true,
      latestKlineBySymbol: {
        AKT: kline("AKT", BASE_TIME + HOUR_MS, 109),
      },
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      speedTierBySymbol: buildSpeedTierBySymbolFromCoinTags({
        AKT: ["Speed Tier 2"],
        TAO: ["Speed Tier 3"],
      }),
      minActionableAbsoluteLevel: 3,
      volatilityPointsMap: {
        AKT: [
          point("AKT", {
            lvl: 1,
            p: 100,
            t: BASE_TIME - 2 * HOUR_MS,
          }),
          point("AKT", {
            lvl: 2,
            p: 106,
            t: BASE_TIME,
          }),
        ],
        TAO: [
          point("TAO", {
            lvl: 2,
            p: 100,
            t: BASE_TIME - 2 * HOUR_MS,
          }),
          point("TAO", {
            lvl: 3,
            p: 110,
            t: BASE_TIME,
          }),
        ],
      },
    });
    const recommendations = evaluation.recommendations;

    // PROD:DECISION_V19_WAIT_OR_ENTER
    expect(recommendations).toEqual([]);
    // PROD:ENTRY_DECISION_DIAGNOSTICS
    expect(evaluation.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "WAITING_FOR_PROJECTION",
        status: "blocked",
        symbol: "TAO",
      }),
    );
    expect(evaluation.diagnostics[0].reason).toContain(
      "Waiting for AKT to reach Level 3",
    );
  });

  it("fetches latest klines inside v19 when no latest kline map is supplied", async () => {
    const requestedSymbols: string[] = [];
    const recommendations = await getRecommendationsV19({
      bypass: true,
      exchange: {
        getKlines: async ({ symbol }: { symbol: string }) => {
          requestedSymbols.push(symbol);
          return [kline("AKT", BASE_TIME + HOUR_MS, 109)];
        },
      } as unknown as IExchange,
      marketType: "FUTURES",
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      speedTierBySymbol: buildSpeedTierBySymbolFromCoinTags({
        AKT: ["Speed Tier 2"],
        TAO: ["Speed Tier 3"],
      }),
      minActionableAbsoluteLevel: 3,
      volatilityPointsMap: {
        AKT: [
          point("AKT", {
            lvl: 1,
            p: 100,
            t: BASE_TIME - 2 * HOUR_MS,
          }),
          point("AKT", {
            lvl: 2,
            p: 106,
            t: BASE_TIME,
          }),
        ],
        TAO: [
          point("TAO", {
            lvl: 2,
            p: 100,
            t: BASE_TIME - 2 * HOUR_MS,
          }),
          point("TAO", {
            lvl: 3,
            p: 110,
            t: BASE_TIME,
          }),
        ],
      },
    });

    // PROD:DECISION_V19_LATEST_KLINE
    expect(requestedSymbols).toEqual(["AKT_USDT"]);
    // PROD:DECISION_V19_WAIT_OR_ENTER
    expect(recommendations).toEqual([]);
  });

  it("ignores a level-2 candidate when the latest kline moves away from level 3", async () => {
    const recommendations = await getRecommendationsV19({
      bypass: true,
      latestKlineBySymbol: {
        AIXBT: kline("AIXBT", BASE_TIME + HOUR_MS, 98),
      },
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      speedTierBySymbol: buildSpeedTierBySymbolFromCoinTags({
        AIXBT: ["Speed Tier 1"],
        TAO: ["Speed Tier 3"],
      }),
      minActionableAbsoluteLevel: 3,
      volatilityPointsMap: {
        AIXBT: [
          point("AIXBT", {
            lvl: 1,
            p: 95,
            t: BASE_TIME - HOUR_MS,
          }),
          point("AIXBT", {
            lvl: 2,
            p: 100,
            t: BASE_TIME,
          }),
        ],
        TAO: [
          point("TAO", {
            lvl: 2,
            p: 100,
            t: BASE_TIME - HOUR_MS,
          }),
          point("TAO", {
            lvl: 3,
            p: 110,
            t: BASE_TIME,
          }),
        ],
      },
    });

    // PROD:DECISION_V19_DIRECTION_CHECK
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].symbol).toBe("TAO");
  });

  it("selects the only level-3 coin when other coins are level 1 or neutral", async () => {
    const recommendations = await getRecommendationsV19({
      bypass: true,
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      speedTierBySymbol: buildSpeedTierBySymbolFromCoinTags({
        AIXBT: ["Speed Tier 1"],
        ENS: ["Speed Tier 1"],
        TAO: ["Speed Tier 3"],
      }),
      volatilityPointsMap: {
        AIXBT: [
          point("AIXBT", {
            lvl: 1,
            p: 102,
            t: BASE_TIME,
          }),
        ],
        ENS: [
          point("ENS", {
            lvl: 0,
            p: 100,
            t: BASE_TIME,
          }),
        ],
        TAO: [
          point("TAO", {
            lvl: 2,
            p: 100,
            t: BASE_TIME - HOUR_MS,
          }),
          point("TAO", {
            lvl: 3,
            p: 110,
            t: BASE_TIME,
          }),
        ],
      },
    });

    // PROD:DECISION_V19_LEVEL_GATE
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].symbol).toBe("TAO");
    expect(recommendations[0].lvl).toBe(3);
  });

  it("uses the configured minimum actionable level and fetches the level below it", async () => {
    const requestedSymbols: string[] = [];
    const recommendations = await getRecommendationsV19({
      bypass: true,
      exchange: {
        getKlines: async ({ symbol }: { symbol: string }) => {
          requestedSymbols.push(symbol);
          return [kline("AIXBT", BASE_TIME + HOUR_MS, 98)];
        },
      } as unknown as IExchange,
      minActionableAbsoluteLevel: 4,
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      speedTierBySymbol: buildSpeedTierBySymbolFromCoinTags({
        AIXBT: ["Speed Tier 1"],
        TAO: ["Speed Tier 3"],
      }),
      volatilityPointsMap: {
        AIXBT: [
          point("AIXBT", {
            lvl: 2,
            p: 95,
            t: BASE_TIME - HOUR_MS,
          }),
          point("AIXBT", {
            lvl: 3,
            p: 100,
            t: BASE_TIME,
          }),
        ],
        TAO: [
          point("TAO", {
            lvl: 3,
            p: 100,
            t: BASE_TIME - HOUR_MS,
          }),
          point("TAO", {
            lvl: 4,
            p: 110,
            t: BASE_TIME,
          }),
        ],
      },
    });

    // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
    expect(requestedSymbols).toEqual(["AIXBT_USDT"]);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].symbol).toBe("TAO");
    expect(recommendations[0].lvl).toBe(4);
  });

  it("chooses the fastest immediate speed-tier entry when waiting is not better", async () => {
    const evaluation = await evaluateRecommendationsV19({
      bypass: true,
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      speedTierBySymbol: buildSpeedTierBySymbolFromCoinTags({
        AIXBT: ["Speed Tier 1"],
        TAO: ["Speed Tier 3"],
      }),
      volatilityPointsMap: {
        AIXBT: [
          point("AIXBT", {
            lvl: 2,
            p: 100,
            t: BASE_TIME - HOUR_MS,
          }),
          point("AIXBT", {
            lvl: 3,
            p: 108,
            t: BASE_TIME,
          }),
        ],
        TAO: [
          point("TAO", {
            lvl: 2,
            p: 100,
            t: BASE_TIME - HOUR_MS,
          }),
          point("TAO", {
            lvl: 4,
            p: 112,
            t: BASE_TIME,
          }),
        ],
      },
    });
    const recommendations = evaluation.recommendations;

    // PROD:DECISION_V19_WAIT_OR_ENTER
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].symbol).toBe("AIXBT");
    expect(recommendations[0].message).toContain("speed tier 1");
    // PROD:ENTRY_DECISION_DIAGNOSTICS
    expect(evaluation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "READY",
          status: "ready",
          symbol: "AIXBT",
        }),
        expect.objectContaining({
          code: "FASTER_CANDIDATE_SELECTED",
          status: "blocked",
          symbol: "TAO",
        }),
      ]),
    );
    expect(
      evaluation.diagnostics.find((item) => item.symbol === "TAO")?.reason,
    ).toContain("selected AIXBT");
  });

  it("explains when an actionable volatility point was already used", async () => {
    const evaluation = await evaluateRecommendationsV19({
      bypass: true,
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      minActionableAbsoluteLevel: 2,
      volatilityPointsMap: {
        AIXBT: [
          point("AIXBT", {
            lvl: 3,
            used: true,
          }),
        ],
      },
    });

    // PROD:ENTRY_DECISION_DIAGNOSTICS
    expect(evaluation.recommendations).toEqual([]);
    expect(evaluation.diagnostics).toEqual([
      expect.objectContaining({
        code: "USED_VOLATILITY_POINT",
        level: 3,
        status: "blocked",
        symbol: "AIXBT",
      }),
    ]);
  });
});
