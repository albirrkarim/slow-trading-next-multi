import slowTrading from "@/lib/slowTrading";
import { createTestPosition } from "../fixtures/position";

const {
  buildState: buildSlowWatchReserveState,
  getReservedRemainingUsdt,
} = slowTrading.watchReserve.reserve;
const { fitMarginToReserve: fitEntryMarginToSlowWatchReserve } =
  slowTrading.watchReserve.entry;
const {
  canKeepSpendableForLargestUnreservedBailout,
  canSpendWatchStepMargin,
  getLargestUnreservedWatchStepMarginUsdt,
  getLockedQuoteAssetValue,
  getSpendableQuoteAssetValue,
} = slowTrading.watchReserve.balance;

describe("reserve helpers", () => {
  it("builds the reserve budget used by the entry gate", () => {
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 100,
      entryLevel: -4,
      reserveLevels: 2,
      pctAlloc: 2,
    });

    expect(getReservedRemainingUsdt(watchState)).toBe(800);
    expect(watchState.steps).toHaveLength(2);
    expect(watchState.steps.map((step) => step.marginUsdt)).toEqual([
      200,
      600,
    ]);
  });

  it("fits entry margin to leave a full spendable buffer after reserve allocation", () => {
    const fittedEntryMargin = fitEntryMarginToSlowWatchReserve({
      desiredMarginUsdt: 50,
      spendableUsdt: 100,
      reserveLevels: 2,
      pctAlloc: 2,
    });
    const watchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: fittedEntryMargin,
      entryLevel: -4,
      reserveLevels: 2,
      pctAlloc: 2,
    });

    expect(fittedEntryMargin).toBe(10);
    expect(getReservedRemainingUsdt(watchState)).toBe(80);
    expect(100 - fittedEntryMargin - getReservedRemainingUsdt(watchState)).toBe(10);
  });

  it("computes spendable balance from exchange-free quote asset", () => {
    expect(
      getSpendableQuoteAssetValue({
        quoteAsset: 200,
        reservedQuoteAsset: 75,
        safeHaven: 10,
      }),
    ).toBe(115);
  });

  it("computes locked balance from open-position margin", () => {
    expect(
      getLockedQuoteAssetValue({
        activePositions: [
          createTestPosition({
            marginUsdt: 40,
            notionalUsdt: 50,
          }),
          createTestPosition({
            leverage: 2,
            marginUsdt: 15,
            notionalUsdt: 30,
          }),
        ],
      }),
    ).toBe(55);
  });

  it("blocks unreserved watch steps when only reserved balance remains", () => {
    expect(
      canSpendWatchStepMargin({
        step: {
          level: -6,
          marginUsdt: 180,
          allocationPct: 2,
          status: "UNRESERVED",
        },
        quoteAsset: 200,
        reservedQuoteAsset: 100,
        minimalUsdt: 2,
      }),
    ).toBe(false);

    expect(
      canSpendWatchStepMargin({
        step: {
          level: -5,
          marginUsdt: 60,
          allocationPct: 2,
          status: "RESERVED",
        },
        quoteAsset: 200,
        reservedQuoteAsset: 100,
        minimalUsdt: 2,
      }),
    ).toBe(true);
  });

  it("requires spendable balance to preserve the largest unreserved bailout step", () => {
    const activePositions = [
      createTestPosition({
        averaging: {
          entryLevel: -3,
          lastHandledLevel: -3,
          reserveBaseMarginUsdt: 99,
          reservedRemainingMarginUsdt: 792,
          steps: [
            {
              level: -4,
              marginUsdt: 198,
              allocationPct: 2,
              status: "RESERVED",
            },
            {
              level: -5,
              marginUsdt: 594,
              allocationPct: 2,
              status: "RESERVED",
            },
            {
              level: -6,
              marginUsdt: 1782,
              allocationPct: 2,
              status: "UNRESERVED",
            },
          ],
        },
      }),
    ];

    // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
    expect(getLargestUnreservedWatchStepMarginUsdt(activePositions)).toBe(1782);
    expect(
      canKeepSpendableForLargestUnreservedBailout({
        activePositions,
        entryMarginUsdt: 1000,
        reserveBudgetUsdt: 0,
        spendableUsdt: 2000,
      }),
    ).toMatchObject({
      canEnter: false,
      largestUnreservedBailoutUsdt: 1782,
      spendableAfterEntryUsdt: 1000,
    });
    expect(
      canKeepSpendableForLargestUnreservedBailout({
        activePositions,
        entryMarginUsdt: 1000,
        reserveBudgetUsdt: 0,
        spendableUsdt: 3000,
      }).canEnter,
    ).toBe(true);
  });

  it("includes the projected new position in the bailout requirement", () => {
    const projectedWatchState = buildSlowWatchReserveState({
      direction: "LONG",
      baseMarginUsdt: 20,
      entryLevel: 0,
      maxNextLevels: 2,
      pctAlloc: 2,
      reserveLevels: 1,
    });

    // BOTH:ALWAYS_HAVE_SPENDABLE_TO_BAILING_OUT
    expect(
      canKeepSpendableForLargestUnreservedBailout({
        activePositions: [],
        entryMarginUsdt: 20,
        projectedWatchState,
        reserveBudgetUsdt: 40,
        spendableUsdt: 180,
      }),
    ).toMatchObject({
      canEnter: true,
      largestUnreservedBailoutUsdt: 120,
      spendableAfterEntryUsdt: 120,
    });
    expect(
      canKeepSpendableForLargestUnreservedBailout({
        activePositions: [],
        entryMarginUsdt: 20,
        projectedWatchState,
        reserveBudgetUsdt: 40,
        spendableUsdt: 179,
      }).canEnter,
    ).toBe(false);
  });
});
