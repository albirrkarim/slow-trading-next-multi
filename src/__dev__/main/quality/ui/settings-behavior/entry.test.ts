import type { EntryRecommendation } from "@/lib/brain";
import { TradingMode } from "@/lib/exchange";
import slowTradingWatchReserve from "@/lib/slowTrading/watch-reserve";
import { resolveEntryLeverage } from "@/lib/trading/execute/entry-leverage";

function entrySignal(overrides: Partial<EntryRecommendation> = {}) {
  return {
    amountProbab: 1,
    id: "SUI-entry",
    l: "B",
    lvl: -4,
    maxLeverage: 10,
    message: "entry",
    p: 1,
    pct: 5,
    symbol: "SUI",
    t: 1,
    vb: 1,
    vq: 1,
    ...overrides,
  } as EntryRecommendation;
}

describe("settings behavior: entry", () => {
  it("uses enableWatchLogic to decide whether entry margin must reserve averaging budget", () => {
    expect(
      slowTradingWatchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
        enableWatchLogic: true,
        reserveLevels: 2,
        pctAlloc: 2,
      }),
    ).toBe(10);

    expect(
      slowTradingWatchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
        enableWatchLogic: false,
        reserveLevels: 2,
        pctAlloc: 2,
      }),
    ).toBe(50);
  });

  it("applies maxEntryMarginPct and maxEntryMargin as real margin caps", () => {
    expect(
      slowTradingWatchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
        enableWatchLogic: true,
        reserveLevels: 2,
        pctAlloc: 2,
        maxEntryMarginPct: 75,
      }),
    ).toBe(8);

    expect(
      slowTradingWatchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 100,
        enableWatchLogic: true,
        reserveLevels: 2,
        pctAlloc: 2,
        maxEntryMargin: 7,
      }),
    ).toBe(7);
  });

  it("applies maxEntryBased24HourVolPct before percentage and fixed caps", () => {
    const volume24h = 100 / 0.002;

    expect(
      slowTradingWatchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 200,
        enableWatchLogic: true,
        reserveLevels: 2,
        pctAlloc: 2,
        volume24h,
      }),
    ).toBe(10);

    expect(
      slowTradingWatchReserve.entry.adjustMarginForConfig({
        desiredMarginUsdt: 50,
        spendableUsdt: 200,
        enableWatchLogic: true,
        reserveLevels: 2,
        pctAlloc: 2,
        volume24h,
        maxEntryMarginPct: 75,
        maxEntryMargin: 7,
      }),
    ).toBe(7);
  });

  it("applies max and exact futures leverage while keeping spot at 1", () => {
    expect(
      resolveEntryLeverage({
        entrySignal: entrySignal(),
        tradingMode: TradingMode.FUTURES,
        config: { maxLeverage: 2 },
      }),
    ).toBe(2);

    expect(
      resolveEntryLeverage({
        entrySignal: entrySignal({ maxLeverage: 1 }),
        tradingMode: TradingMode.FUTURES,
        config: {
          exactLeverage: 6,
          maxLeverage: 2,
        },
      }),
    ).toBe(6);

    expect(
      resolveEntryLeverage({
        entrySignal: entrySignal(),
        tradingMode: TradingMode.SPOT,
        config: {
          exactLeverage: 6,
          maxLeverage: 5,
        },
      }),
    ).toBe(1);
  });
});
