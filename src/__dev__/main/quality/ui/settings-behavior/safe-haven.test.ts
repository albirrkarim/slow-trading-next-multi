import {
  getAmountToSave,
  scheduleSafeHavenRequest,
} from "@/lib/dynamic/utils/safeHaven";
import type { DynamicTradeMemory } from "@/lib/dynamic";

function createMemory(): DynamicTradeMemory {
  return {
    priceNormMapOverTime: {},
    quoteAsset: 1_000,
    reservedQuoteAsset: 0,
    safeHaven: 0,
    safeHavenHistory: [],
    safeHavenRequest: 0,
    startingBalanceUSDT: 1_000,
    volatilitySnapshots: [],
  };
}

describe("settings behavior: safe haven", () => {
  it("uses safeUSDTPerMonth when no percent setting is configured", () => {
    expect(
      getAmountToSave({
        config: {
          safeUSDTPerMonth: 25,
        },
        currentAsset: 1_000,
      }),
    ).toBe(25);
  });

  it("uses safePercentPerMonth when configured", () => {
    expect(
      getAmountToSave({
        config: {
          safePercentPerMonth: 0.1,
        },
        currentAsset: 1_000,
      }),
    ).toBe(100);
  });

  it("uses fixed USDT when both monthly Safe Haven inputs are populated", () => {
    expect(
      getAmountToSave({
        config: {
          safeUSDTPerMonth: 25,
          safePercentPerMonth: 0.1,
        },
        currentAsset: 1_000,
      }),
    ).toBe(25);
  });

  it("falls back to percent when the fixed monthly amount is zero", () => {
    expect(
      getAmountToSave({
        config: {
          safeUSDTPerMonth: 0,
          safePercentPerMonth: 0.1,
        },
        currentAsset: 1_000,
      }),
    ).toBe(100);
  });

  it("uses minimalAssetOnTrade to avoid taking too much capital from trading", () => {
    expect(
      getAmountToSave({
        config: {
          safePercentPerMonth: 0.5,
          minimalAssetOnTrade: 800,
        },
        currentAsset: 1_000,
      }),
    ).toBe(200);
  });

  it("schedules a safe-haven request once per UTC month", () => {
    const memory = createMemory();

    expect(
      scheduleSafeHavenRequest({
        config: {
          safeUSDTPerMonth: 25,
        },
        currentAsset: 1_000,
        currentTimeMs: Date.UTC(2026, 6, 1),
        memory,
      }),
    ).toBe(25);

    expect(
      scheduleSafeHavenRequest({
        config: {
          safeUSDTPerMonth: 50,
        },
        currentAsset: 1_000,
        currentTimeMs: Date.UTC(2026, 6, 9),
        memory,
      }),
    ).toBe(25);
  });
});
