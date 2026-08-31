import { TradingMode } from "@/lib/exchange";
import slowTradingWatchReserve from "@/lib/slowTrading/watch-reserve";
import type { Position } from "@/lib/trading/models";

function createPosition(): Position {
  const averaging = slowTradingWatchReserve.reserve.buildState({
    baseMarginUsdt: 10,
    direction: "LONG",
    entryLevel: -4,
    reserveLevels: 2,
    pctAlloc: 2,
  });
  return {
    symbol: "SUI",
    executionMode: "sandbox",
    tradingMode: TradingMode.FUTURES,
    direction: "LONG",
    opened: {
      t: 1,
      vPoint: { id: "B_TEST", lvl: -4 },
      reason: "COMMON",
      message: "[ENTRY] Test position",
      price: 100,
    },
    exposure: {
      averageEntryPrice: 100,
      quantity: 0.1,
      notionalUsdt: 10,
      marginUsdt: 10,
      leverage: 1,
    },
    fees: { entryUsdt: 0 },
    strategy: { entry: {}, averaging },
    pnl: {},
  };
}

describe("settings behavior: averaging", () => {
  it("uses watchReserveLevels and watchReservePctAlloc to build reserve steps", () => {
    const watchState = slowTradingWatchReserve.reserve.buildState({
      baseMarginUsdt: 10,
      direction: "LONG",
      entryLevel: -4,
      reserveLevels: 2,
      pctAlloc: 3,
    });

    expect(watchState.steps).toMatchObject([
      { level: -5, marginUsdt: 30, allocationPct: 3, status: "RESERVED" },
      { level: -6, marginUsdt: 120, allocationPct: 3, status: "RESERVED" },
    ]);
    expect(watchState.reservedRemainingMarginUsdt).toBe(150);
  });

  it("uses watchMaxNextAveragingLevels to cap deeper averaging recommendations", () => {
    const position = createPosition();
    const volatilityPointsMap = {
      SUI: [
        {
          id: "SUI-level-minus-6",
          l: "B",
          lvl: -6,
          p: 80,
          pct: 8,
          symbol: "SUI",
          t: 2,
          vb: 1,
          vq: 1,
        },
      ],
    } as any;

    expect(
      slowTradingWatchReserve.averaging.generateRecommendations({
        activePositions: [position],
        volatilityPointsMap,
        config: {
          enableWatchLogic: true,
          watchMaxNextAveragingLevels: 1,
        } as any,
      }).recommendations,
    ).toHaveLength(0);

    expect(
      slowTradingWatchReserve.averaging.generateRecommendations({
        activePositions: [position],
        volatilityPointsMap,
        config: {
          enableWatchLogic: true,
          watchMaxNextAveragingLevels: 2,
        } as any,
      }).recommendations,
    ).toHaveLength(1);
  });

  it("uses the adaptive config to control its multiplier and profit target", () => {
    const position = createPosition();
    const nextStep = position.strategy.averaging.steps[0];
    const rescueInput = {
      position: {
        ...position,
        exposure: {
          ...position.exposure,
          averageEntryPrice: 90,
        },
      },
      step: nextStep,
      executablePrice: 81,
      rescueAnchorPrice: 80,
      quoteAsset: 1_000,
      reservedQuoteAsset: 0,
      targetMovePct: 5,
    };

    expect(
      slowTradingWatchReserve.averaging.resolveRescueProjection({
        ...rescueInput,
        adaptiveAveraging: {
          enabled: false,
          maxMultiplier: 5,
          minProjectedProfitPct: 2,
        },
      }),
    ).toMatchObject({
      canExecute: false,
      marginUsdt: 20,
      multiplier: 2,
      reason: "PROJECTED_PROFIT_BELOW_TARGET",
    });

    expect(
      slowTradingWatchReserve.averaging.resolveRescueProjection({
        ...rescueInput,
        adaptiveAveraging: {
          enabled: true,
          maxMultiplier: 5,
          minProjectedProfitPct: 2,
        },
      }),
    ).toMatchObject({
      canExecute: true,
      marginUsdt: 50,
      multiplier: 5,
      reason: "READY",
    });

    expect(
      slowTradingWatchReserve.averaging.resolveRescueProjection({
        ...rescueInput,
        adaptiveAveraging: {
          enabled: true,
          maxMultiplier: 5,
          minProjectedProfitPct: 1,
        },
      }),
    ).toMatchObject({
      canExecute: true,
      marginUsdt: 30,
      multiplier: 3,
      reason: "READY",
    });

    expect(
      slowTradingWatchReserve.averaging.resolveRescueProjection({
        ...rescueInput,
        adaptiveAveraging: {
          enabled: true,
          maxMultiplier: 4,
          minProjectedProfitPct: 2,
        },
      }),
    ).toMatchObject({
      canExecute: false,
      marginUsdt: 20,
      multiplier: 2,
      reason: "PROJECTED_PROFIT_BELOW_TARGET",
    });
  });

  it("allows the normal watch step when the rescue-projection guard is disabled", () => {
    const position = createPosition();
    const nextStep = position.strategy.averaging.steps[0];
    const result = slowTradingWatchReserve.averaging.resolveRescueProjection({
      position,
      step: nextStep,
      executablePrice: 101,
      rescueAnchorPrice: 100,
      quoteAsset: 1_000,
      reservedQuoteAsset: 0,
      adaptiveAveraging: {
        enabled: true,
        maxMultiplier: 5,
        minProjectedProfitPct: 2,
      },
      rescueProjectionGuardEnabled: false,
    });

    // BOTH:AVERAGING_IMPROVES_RESCUE_PROJECTION
    expect(result).toMatchObject({
      canExecute: true,
      marginUsdt: 20,
      multiplier: 2,
      reason: "GUARD_DISABLED",
    });
  });
});
