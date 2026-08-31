import type { EntryRecommendation } from "@/lib/brain/algorithms/type-execute";
import { TradingMode } from "@/lib/exchange";
import { executeEntry } from "@/lib/trading/execute/execute-entry";
import lateEntryVPointDrift from "@/lib/trading/execute/late-entry-vpoint-drift";
import type { TradingModelMemory } from "@/lib/trading/models";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPosition } from "../fixtures/position";

const exchangeMocks = vi.hoisted(() => ({
  setLeverage: vi.fn(),
}));

const entryMocks = vi.hoisted(() => ({
  dynamicEntry: vi.fn(),
}));

vi.mock("@/lib/exchange", async () => {
  const actual = await vi.importActual<any>("@/lib/exchange");

  return {
    ...actual,
    getExchange: vi.fn(() => ({
      setLeverage: exchangeMocks.setLeverage,
    })),
  };
});

vi.mock("@/lib/trading/execute/models/entry", () => ({
  dynamicEntry: entryMocks.dynamicEntry,
}));

function createSignal(
  overrides: Partial<EntryRecommendation> = {},
): EntryRecommendation {
  return {
    amountProbab: 1,
    id: "TOP[3]",
    l: "T",
    lvl: 3,
    maxLeverage: 1,
    message: "entry",
    pct: 3,
    p: 100,
    symbol: "SUI",
    t: 1,
    ...overrides,
  } as EntryRecommendation;
}

function createMemory(signal: EntryRecommendation): TradingModelMemory {
  return {
    positions: [],
    positionsSell: [],
    volatility: {
      lastVolatility: [signal],
      symbol: signal.symbol ?? "SUI",
    },
  } as TradingModelMemory;
}

function createKline(p: number) {
  return [1, `${p}`, `${p}`, `${p}`, `${p}`, "1"] as any;
}

describe("production late entry vPoint drift guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeMocks.setLeverage.mockResolvedValue(true);
  });

  it("calculates profitable drift for LONG and SHORT without blocking adverse movement", () => {
    expect(
      lateEntryVPointDrift.calculateProfitDriftPct({
        currentPrice: 101.01,
        direction: "LONG",
        vPointPrice: 100,
      }),
    ).toBeCloseTo(1.01);
    expect(
      lateEntryVPointDrift.calculateProfitDriftPct({
        currentPrice: 98.99,
        direction: "SHORT",
        vPointPrice: 100,
      }),
    ).toBeCloseTo(1.01);
    expect(
      lateEntryVPointDrift.evaluate({
        currentPrice: 99,
        direction: "LONG",
        vPointPrice: 100,
      }).blocked,
    ).toBe(false);
  });

  it("allows exactly one percent at volatility threshold 5", () => {
    expect(
      lateEntryVPointDrift.evaluate(
        {
          currentPrice: 101,
          direction: "LONG",
          vPointPrice: 100,
        },
        5,
      ).blocked,
    ).toBe(false);
    const blocked = lateEntryVPointDrift.evaluate(
      {
        currentPrice: 101.01,
        direction: "LONG",
        vPointPrice: 100,
      },
      5,
    );
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toContain("already drifted 1.01%");
    expect(blocked.reason).toContain("maximum 1.00%");
  });

  it("uses a 0.5 percent limit below volatility threshold 5", () => {
    expect(lateEntryVPointDrift.resolveMaxProfitDriftPct(2)).toBe(0.5);
    expect(lateEntryVPointDrift.resolveMaxProfitDriftPct(4)).toBe(0.5);
    expect(lateEntryVPointDrift.resolveMaxProfitDriftPct(5)).toBe(1);

    expect(
      lateEntryVPointDrift.evaluate(
        {
          currentPrice: 100.5,
          direction: "LONG",
          vPointPrice: 100,
        },
        2,
      ).blocked,
    ).toBe(false);

    const blocked = lateEntryVPointDrift.evaluate(
      {
        currentPrice: 100.51,
        direction: "LONG",
        vPointPrice: 100,
      },
      2,
    );

    // PROD:LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toContain("already drifted 0.51%");
    expect(blocked.reason).toContain("maximum 0.50%");
  });

  it.each(["live", "sandbox"] as const)(
    "blocks a late futures entry before execution in %s mode",
    async (executionMode) => {
      const signal = createSignal();

      const result = await executeEntry({
        balanceOverride: {
          baseAsset: 0,
          quoteAsset: 1_000,
        },
        current: createKline(98.9),
        dynamicTradeConfig: {} as any,
        entrySignal: signal,
        exchangeType: "binance",
        executionMode,
        investAmount: 100,
        modelConfig: {} as any,
        modelMemory: createMemory(signal),
        simulate: executionMode === "sandbox",
        tradingMode: TradingMode.FUTURES,
      });

      // PROD:LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT
      expect(result.action).toBeUndefined();
      expect(result.message).toContain("LATE_ENTRY_VPOINT_PRICE_DRIFT_PCT");
      expect(result.message).toContain("1.10%");
      expect(exchangeMocks.setLeverage).not.toHaveBeenCalled();
      expect(entryMocks.dynamicEntry).not.toHaveBeenCalled();
    },
  );

  it.each(["live", "sandbox"] as const)(
    "blocks a new %s entry when the active mode reaches its position cap",
    async (executionMode) => {
      const signal = createSignal();
      const modelMemory = createMemory(signal);
      const otherMemory = createMemory(
        createSignal({ symbol: "AAVE", id: "AAVE-entry" }),
      );
      otherMemory.positions.push(createTestPosition({
        entryId: "AAVE-entry",
        entryPrice: 10,
        entryTime: 1,
        executionMode,
        notionalUsdt: 10,
        quantity: 1,
        symbol: "AAVE",
        tradingMode: TradingMode.FUTURES,
      }));

      const result = await executeEntry({
        allModelMemories: [modelMemory, otherMemory],
        dynamicTradeConfig: {
          maxOpenPositions: 1,
        } as any,
        entrySignal: signal,
        exchangeType: "binance",
        executionMode,
        investAmount: 100,
        modelConfig: {} as any,
        modelMemory,
        simulate: executionMode === "sandbox",
        tradingMode: TradingMode.FUTURES,
      });

      // BOTH:MAX_OPEN_POSITIONS_ENTRY_GUARD
      expect(result.tradingDetail).toBeUndefined();
      expect(result.message).toContain("MAX_OPEN_POSITIONS_ENTRY_GUARD");
      expect(result.message).toContain("1 of 1");
      expect(modelMemory.positions).toHaveLength(0);
      expect(exchangeMocks.setLeverage).not.toHaveBeenCalled();
      expect(entryMocks.dynamicEntry).not.toHaveBeenCalled();
    },
  );

  it("allows a level-1 production entry when configured", async () => {
    const signal = createSignal({
      id: "TOP[1]",
      lvl: 1,
    });
    entryMocks.dynamicEntry.mockResolvedValue({
      action: "HOLD",
      reason: "No entry",
    });

    const result = await executeEntry({
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 1_000,
      },
      current: createKline(100),
      dynamicTradeConfig: {
        minActionableAbsoluteLevel: 1,
      } as any,
      entrySignal: signal,
      exchangeType: "binance",
      executionMode: "live",
      investAmount: 100,
      modelConfig: {} as any,
      modelMemory: createMemory(signal),
      simulate: false,
      tradingMode: TradingMode.FUTURES,
    });

    // BOTH:DECISION_ENGINE_MIN_ACTIONABLE_LEVEL_CONFIG
    expect(result.message).toBe("No entry");
    expect(exchangeMocks.setLeverage).toHaveBeenCalled();
    expect(entryMocks.dynamicEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        minActionableAbsoluteLevel: 1,
      }),
    );
  });

  it("does not mutate futures account settings in sandbox mode", async () => {
    const signal = createSignal();
    entryMocks.dynamicEntry.mockResolvedValue({
      action: "HOLD",
      reason: "No entry",
    });

    await executeEntry({
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 1_000,
      },
      current: createKline(100),
      dynamicTradeConfig: {} as any,
      entrySignal: signal,
      exchangeType: "binance",
      executionMode: "sandbox",
      investAmount: 100,
      modelConfig: {} as any,
      modelMemory: createMemory(signal),
      simulate: true,
      tradingMode: TradingMode.FUTURES,
    });

    // PROD:FUTURES_ENTRY_ACCOUNT_SETUP
    expect(exchangeMocks.setLeverage).not.toHaveBeenCalled();
    expect(entryMocks.dynamicEntry).toHaveBeenCalledOnce();
  });

  it("configures exactLeverage for a live futures entry", async () => {
    const signal = createSignal({
      amountProbab: 0.3,
      maxLeverage: 1,
    });
    exchangeMocks.setLeverage.mockResolvedValue(true);
    entryMocks.dynamicEntry.mockResolvedValue({
      action: "HOLD",
      reason: "No entry",
    });

    await executeEntry({
      balanceOverride: {
        baseAsset: 0,
        quoteAsset: 1_000,
      },
      current: createKline(100),
      dynamicTradeConfig: {
        exactLeverage: 6,
        maxLeverage: 2,
      } as any,
      entrySignal: signal,
      exchangeType: "binance",
      executionMode: "live",
      investAmount: 100,
      modelConfig: {} as any,
      modelMemory: createMemory(signal),
      simulate: false,
      tradingMode: TradingMode.FUTURES,
    });

    // BOTH:LEVERAGE_CALCULATION
    expect(exchangeMocks.setLeverage).toHaveBeenCalledWith("SUI_USDT", 6);
  });

  it("aborts a live futures entry when account setup reports failure", async () => {
    const signal = createSignal();
    exchangeMocks.setLeverage.mockResolvedValue(false);

    await expect(
      executeEntry({
        balanceOverride: {
          baseAsset: 0,
          quoteAsset: 1_000,
        },
        current: createKline(100),
        dynamicTradeConfig: {} as any,
        entrySignal: signal,
        exchangeType: "binance",
        executionMode: "live",
        investAmount: 100,
        modelConfig: {} as any,
        modelMemory: createMemory(signal),
        simulate: false,
        tradingMode: TradingMode.FUTURES,
      }),
    ).rejects.toThrow(
      "Failed to configure futures leverage and isolated margin for SUI_USDT at 1x",
    );

    // PROD:FUTURES_ENTRY_ACCOUNT_SETUP
    expect(entryMocks.dynamicEntry).not.toHaveBeenCalled();
  });

  it("preserves the Binance rejection for the operational error log and notification", async () => {
    const signal = createSignal();
    exchangeMocks.setLeverage.mockRejectedValue(
      new Error(
        "Binance API Error: Invalid API-key, IP, or permissions for action (code: -2015)",
      ),
    );

    await expect(
      executeEntry({
        balanceOverride: {
          baseAsset: 0,
          quoteAsset: 1_000,
        },
        current: createKline(100),
        dynamicTradeConfig: {} as any,
        entrySignal: signal,
        exchangeType: "binance",
        executionMode: "live",
        investAmount: 100,
        modelConfig: {} as any,
        modelMemory: createMemory(signal),
        simulate: false,
        tradingMode: TradingMode.FUTURES,
      }),
    ).rejects.toThrow("code: -2015");

    // PROD:FUTURES_ENTRY_ACCOUNT_SETUP
    expect(entryMocks.dynamicEntry).not.toHaveBeenCalled();
  });
});
