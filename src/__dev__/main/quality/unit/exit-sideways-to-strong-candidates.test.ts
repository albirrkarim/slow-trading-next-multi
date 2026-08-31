import type { EntryRecommendation } from "@/lib/brain";
import slowTradingSidewaysExit from "@/lib/slowTrading/exit-sideways";
import { TradingMode } from "@/lib/exchange";
import type { Position } from "@/lib/trading/models";
import { createTestPosition } from "../fixtures/position";
import { describe, expect, it } from "vitest";

const BASE_TIME = Date.UTC(2026, 6, 1, 13, 0);

function recommendation(
  symbol: string,
  lvl: number,
): EntryRecommendation {
  return {
    id: `${symbol}_${lvl}`,
    l: lvl > 0 ? "T" : "B",
    lvl,
    p: 100,
    pct: lvl * 5,
    t: BASE_TIME,
    vb: 1,
    vq: 1,
    symbol,
    amountProbab: 1,
    maxLeverage: 3,
    message: `${symbol} level ${lvl}`,
  };
}

function position(
  symbol: string,
  netProfitPercent: number,
  entryTime = BASE_TIME - 60 * 60 * 1_000,
): Position {
  return createTestPosition({
    direction: "LONG",
    entryTime,
    entryPrice: 100,
    netPct: netProfitPercent,
    notionalUsdt: 100,
    quantity: 1,
    symbol,
    tradingMode: TradingMode.FUTURES,
  });
}

describe("sideways exit for strong candidates", () => {
  it("selects one slower sideways position when no worker is available", () => {
    const slowPosition = position("TAO", 0.25);
    const decision =
      slowTradingSidewaysExit.decideForStrongCandidates({
        availableWorkers: 0,
        enabled: true,
        entrySignals: [recommendation("AIXBT", 4)],
        openPositions: [
          {
            netProfitPercent: slowPosition.pnl.netPct,
            position: slowPosition,
            symbol: "TAO",
          },
        ],
        speedTierBySymbol: {
          AIXBT: 1,
          TAO: 3,
        },
      });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(decision.shouldExit).toBe(true);
    expect(decision.position).toBe(slowPosition);
    expect(decision.positionSymbol).toBe("TAO");
    expect(decision.candidate?.symbol).toBe("AIXBT");
  });

  it("does nothing when enough workers are already available", () => {
    const slowPosition = position("TAO", 0.25);
    const decision =
      slowTradingSidewaysExit.decideForStrongCandidates({
        availableWorkers: 1,
        enabled: true,
        entrySignals: [recommendation("AIXBT", 4)],
        openPositions: [
          {
            netProfitPercent: slowPosition.pnl.netPct,
            position: slowPosition,
            symbol: "TAO",
          },
        ],
        speedTierBySymbol: {
          AIXBT: 1,
          TAO: 3,
        },
      });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(decision.shouldExit).toBe(false);
    expect(decision.reason).toBe("workers available");
  });

  it("requires the current position to be sideways after fees", () => {
    const losingPosition = position("TAO", -1.01);
    const decision =
      slowTradingSidewaysExit.decideForStrongCandidates({
        availableWorkers: 0,
        enabled: true,
        entrySignals: [recommendation("AIXBT", 4)],
        openPositions: [
          {
            netProfitPercent: losingPosition.pnl.netPct,
            position: losingPosition,
            symbol: "TAO",
          },
        ],
        speedTierBySymbol: {
          AIXBT: 1,
          TAO: 3,
        },
      });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(decision.shouldExit).toBe(false);
    expect(decision.reason).toBe("no slower sideways position");
  });

  it("only frees a position for a faster speed tier level-4 candidate", () => {
    const tierOnePosition = position("AIXBT", 0.25);
    const decision =
      slowTradingSidewaysExit.decideForStrongCandidates({
        availableWorkers: 0,
        enabled: true,
        entrySignals: [
          recommendation("TAO", 5),
          recommendation("AKT", 3),
        ],
        openPositions: [
          {
            netProfitPercent: tierOnePosition.pnl.netPct,
            position: tierOnePosition,
            symbol: "AIXBT",
          },
        ],
        speedTierBySymbol: {
          AIXBT: 1,
          AKT: 2,
          TAO: 3,
        },
      });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(decision.shouldExit).toBe(false);
    expect(decision.strongCandidateCount).toBe(0);
  });

  it("exits an aged sideways position for an equal speed tier level-4 candidate", () => {
    const agedTierOnePosition = position(
      "DEXE",
      -0.41,
      BASE_TIME - 2 * 24 * 60 * 60 * 1_000,
    );
    const decision =
      slowTradingSidewaysExit.decideForStrongCandidates({
        availableWorkers: 1,
        candidateLateEntryPassedBySymbol: {
          AIXBT: true,
        },
        currentTimeMs: BASE_TIME,
        enabled: true,
        entrySignals: [recommendation("AIXBT", 4)],
        openPositions: [
          {
            netProfitPercent: agedTierOnePosition.pnl.netPct,
            position: agedTierOnePosition,
            symbol: "DEXE",
          },
        ],
        speedTierBySymbol: {
          AIXBT: 1,
          DEXE: 1,
        },
      });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(decision.shouldExit).toBe(true);
    expect(decision.position).toBe(agedTierOnePosition);
    expect(decision.candidate?.symbol).toBe("AIXBT");
    expect(decision.reason).toContain("exit aged sideways position");
  });

  it("does not exit an aged equal-tier position when the candidate fails late-entry drift", () => {
    const agedTierOnePosition = position(
      "DEXE",
      -0.41,
      BASE_TIME - 2 * 24 * 60 * 60 * 1_000,
    );
    const decision =
      slowTradingSidewaysExit.decideForStrongCandidates({
        availableWorkers: 0,
        candidateLateEntryPassedBySymbol: {
          AIXBT: false,
        },
        currentTimeMs: BASE_TIME,
        enabled: true,
        entrySignals: [recommendation("AIXBT", 4)],
        openPositions: [
          {
            netProfitPercent: agedTierOnePosition.pnl.netPct,
            position: agedTierOnePosition,
            symbol: "DEXE",
          },
        ],
        speedTierBySymbol: {
          AIXBT: 1,
          DEXE: 1,
        },
      });

    // BOTH:EXIT_SIDEWAYS_TO_ENTRY_STRONG_CANDIDATES
    expect(decision.shouldExit).toBe(false);
  });
});
