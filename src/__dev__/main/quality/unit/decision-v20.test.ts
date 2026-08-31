import { decisionEngineV20 } from "@/lib/brain/algorithms/v4/decisions/v20/decision";
import { evaluateRecommendations } from "@/lib/brain/algorithms";
import {
  evaluateRecommendationsV20,
  getRecommendationsV20,
} from "@/lib/brain/algorithms/v4/decisions/v20/recommendations";
import { DECISION_ENGINE_MAP } from "@/lib/brain/algorithms/v4/decisions";
import { DESCISION_MODELS, type VolatilityPoint } from "@/lib/dynamic";
import { describe, expect, it } from "vitest";

const BASE_TIME = Date.UTC(2026, 6, 1, 13, 0);

function point(
  symbol: string,
  level: number,
  used = false,
): VolatilityPoint {
  return {
    id: `${symbol}_${level}_${BASE_TIME}`,
    l: level > 0 ? "T" : "B",
    lvl: level,
    p: 100,
    pct: level * 5,
    t: BASE_TIME,
    used,
    vb: 1,
    vq: 1,
  } as VolatilityPoint;
}

function volatilityMap() {
  return {
    AIXBT: [point("AIXBT", -2)],
    BTC: [point("BTC", 4)],
    ENS: [point("ENS", -1)],
    TAO: [point("TAO", 3)],
    USED: [point("USED", -4, true)],
  };
}

describe("decision.v20 direct level entry", () => {
  it("returns every unused production candidate at or above the configured level", () => {
    const evaluation = evaluateRecommendationsV20({
      minActionableAbsoluteLevel: 2,
      volatilityPointsMap: volatilityMap(),
    });

    // PROD:DECISION_V20_LEVEL_GATE
    expect(
      evaluation.recommendations.map((item) => item.symbol),
    ).toEqual(["AIXBT", "TAO"]);
    expect(evaluation.recommendations[0].message).toContain(
      "absolute level 2 meets minimum 2",
    );
    expect(evaluation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "READY",
          status: "ready",
          symbol: "AIXBT",
        }),
        expect.objectContaining({
          code: "READY",
          status: "ready",
          symbol: "TAO",
        }),
        expect.objectContaining({
          code: "BTC_CONTEXT_ONLY",
          status: "blocked",
          symbol: "BTC",
        }),
        expect.objectContaining({
          code: "USED_VOLATILITY_POINT",
          status: "blocked",
          symbol: "USED",
        }),
      ]),
    );
  });

  it("uses the configured threshold without Speed timing or projection", () => {
    const recommendations = getRecommendationsV20({
      minActionableAbsoluteLevel: 3,
      volatilityPointsMap: volatilityMap(),
    });

    // PROD:DECISION_V20_LEVEL_GATE
    expect(recommendations.map((item) => item.symbol)).toEqual(["TAO"]);
  });

  it("uses the same direct level gate and existing sizing in backtest", () => {
    const recommendations = decisionEngineV20({
      currentTimeMs: BASE_TIME,
      dynamicTradeMemory: {
        priceNormMapOverTime: {},
        quoteAsset: 100,
        safeHaven: 0,
        safeHavenHistory: [],
        safeHavenRequest: 0,
        startingBalanceUSDT: 100,
        volatilitySnapshots: [],
      },
      minActionableAbsoluteLevel: 2,
      modelConfig: {
        takeProfitPercent: 3,
      },
      modelMemoryMap: {
        AIXBT: {
          positions: [],
          positionsSell: [],
          volatility: {
            lastVolatility: [],
            symbol: "AIXBT",
          },
        },
      } as any,
      volatilityPointsMap: {
        AIXBT: [point("AIXBT", -2)],
        ENS: [point("ENS", -1)],
      },
    });

    // BTEST:DECISION_V20_LEVEL_GATE
    // BOTH:DECISION_V20_LEVEL_GATE
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      investAmount: 62,
      lvl: -2,
      symbol: "AIXBT",
    });
    expect(recommendations[0].used).toBe(true);
  });

  it("registers v20 in the executable decision engine map", () => {
    expect(DECISION_ENGINE_MAP["decision.v20"]).toBe(decisionEngineV20);
    expect(DESCISION_MODELS).toContainEqual(
      expect.objectContaining({
        value: "decision.v20",
      }),
    );
  });

  it("dispatches production recommendations through decision.v20", async () => {
    const evaluation = await evaluateRecommendations({
      decisionEngineVersion: "decision.v20",
      minActionableAbsoluteLevel: 2,
      modelMemoryMap: {},
      priceNormMapOverTime: {},
      volatilityPointsMap: {
        AIXBT: [point("AIXBT", -2)],
      },
    });

    // PROD:DECISION_V20_LEVEL_GATE
    expect(evaluation.recommendations).toHaveLength(1);
    expect(evaluation.recommendations[0].symbol).toBe("AIXBT");
    expect(evaluation.diagnostics[0]).toMatchObject({
      code: "READY",
      status: "ready",
      symbol: "AIXBT",
    });
  });
});
