import coinFinderPreferences from "@/components/dev/Coins/preferences";
import { describe, expect, it } from "vitest";

describe("coin finder preferences", () => {
  it("restores symbols, range, and all filtering controls", () => {
    const parsed = coinFinderPreferences.parse(
      JSON.stringify({
        candidateFilters: {
          avgBottomToTopMaxHours: "24",
          avgTopToBottomMaxHours: "36",
          entrySequenceCountMinimum: "20",
          entrySignalsPerMonthMinimum: "2",
          firstSeenMinimumMonths: "12",
          healthScoreMinimum: "70",
          holdDurationAvgMaxHours: "12",
          holdDurationMaxMaxHours: "48",
          holdDurationMinMaxHours: "2",
          maxBottom: "-5",
          maxBottomToTopMaxHours: "72",
          maxLevelAbsolute: "6",
          maxTop: "5",
          maxTopToBottomMaxHours: "96",
          vPointsPerMonthMinimum: "10",
          vPointTransitionAvgHours: "48",
          vPointTransitionMaxHours: "240",
        },
        combinationSize: 10,
        filterPresetTags: ["Momentum", " momentum ", "Reviewed"],
        range: "5year",
        requiredTags: ["reviewed", "low-risk"],
        symbolsInput: "SOL, ETH, AKT",
        threshold: [2, 6],
        useCachedVPoints: false,
      }),
    );

    expect(parsed).toMatchObject({
      filterConfig: {
        filters: {
          avgBottomToTopMaxHours: "24",
          avgTopToBottomMaxHours: "36",
          entrySequenceCountMinimum: "20",
          entrySignalsPerMonthMinimum: "2",
          firstSeenMinimumMonths: "12",
          healthScoreMinimum: "70",
          holdDurationAvgMaxHours: "12",
          holdDurationMaxMaxHours: "48",
          holdDurationMinMaxHours: "2",
          maxBottom: "-5",
          maxBottomToTopMaxHours: "72",
          maxLevelAbsolute: "6",
          maxTop: "5",
          maxTopToBottomMaxHours: "96",
          vPointsPerMonthMinimum: "10",
          vPointTransitionAvgHours: "48",
          vPointTransitionMaxHours: "240",
        },
        requiredTags: ["reviewed", "low-risk"],
      },
      filterPresetTags: ["Momentum", "Reviewed"],
      combinationSize: 10,
      range: "5year",
      symbolsInput: "SOL, ETH, AKT",
      threshold: [2, 6],
      useCachedVPoints: false,
    });
  });

  it("falls back safely when stored JSON is invalid", () => {
    expect(coinFinderPreferences.parse("not-json")).toEqual(
      coinFinderPreferences.defaults,
    );
  });
});
