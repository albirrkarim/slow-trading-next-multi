import type { EntryRecommendation } from "@/lib/brain";
import { resolveBacktestExitDecision } from "@/lib/dynamic/backtest-volatility/exit-policy";
import { TradingMode } from "@/lib/exchange";
import { decideSidewaysExitForStrongCandidates } from "@/lib/slowTrading/exit-sideways/decision";
import { dynamicExit } from "@/lib/trading/execute/models/exit";
import { TRADE_MESSAGE } from "@/lib/trading/message";
import type { Position, TradingModelMemory } from "@/lib/trading/models";
import { describe, expect, it, vi } from "vitest";
import { createTestPosition } from "../../fixtures/position";

const exchangeMocks = vi.hoisted(() => ({
  getBothSideFeePercent: vi.fn(() => 0),
}));

vi.mock("@/lib/exchange", async () => {
  const actual = await vi.importActual<any>("@/lib/exchange");

  return {
    ...actual,
    getExchange: () => ({
      getFees: () => ({
        getBothSideFeePercent: exchangeMocks.getBothSideFeePercent,
      }),
    }),
  };
});

function position(netPct?: number): Position {
  return createTestPosition({
    entryPrice: 100,
    entryTime: 1,
    leverage: 1,
    netPct,
    notionalUsdt: 100,
    quantity: 1,
    symbol: "SUI",
    tradingMode: TradingMode.FUTURES,
  });
}

function recommendation(overrides: Partial<EntryRecommendation> = {}) {
  return {
    amountProbab: 1,
    id: "AAVE-candidate",
    l: "B",
    lvl: -4,
    maxLeverage: 1,
    message: "candidate",
    p: 80,
    pct: 8,
    symbol: "AAVE",
    t: 2,
    vb: 1,
    vq: 1,
    ...overrides,
  } as EntryRecommendation;
}

function memory(): TradingModelMemory {
  return {
    positions: [position()],
    positionsSell: [],
    volatility: {
      symbol: "SUI",
      lastVolatility: [],
    },
  };
}

describe("settings behavior: exit", () => {
  it("uses exitSidewaysToFreeWorkersForStrongCandidates to gate sideways decisions", () => {
    const sidewaysPosition = position(0.2);
    const disabled =
      decideSidewaysExitForStrongCandidates({
        availableWorkers: 0,
        enabled: false,
        entrySignals: [recommendation()],
        openPositions: [
          {
            netProfitPercent: sidewaysPosition.pnl.netPct,
            position: sidewaysPosition,
            symbol: "SUI",
          },
        ],
      });

    const enabled =
      decideSidewaysExitForStrongCandidates({
        availableWorkers: 0,
        enabled: true,
        entrySignals: [recommendation()],
        openPositions: [
          {
            netProfitPercent: sidewaysPosition.pnl.netPct,
            position: sidewaysPosition,
            symbol: "SUI",
          },
        ],
        speedTierBySymbol: {
          AAVE: 1,
          SUI: 3,
        },
      });

    expect(disabled.shouldExit).toBe(false);
    expect(enabled.shouldExit).toBe(true);
  });

  it("uses takeProfitPercent after the volatility target zone is hit", () => {
    expect(
      resolveBacktestExitDecision({
        currentPrice: 106,
        forceSell: false,
        globalLiquidation: false,
        hasHitTargetZone: true,
        modelConfig: {
          orderType: "taker",
          stopLossPercent: 20,
          takeProfitPercent: 5,
        },
        position: position(),
      }),
    ).toMatchObject({
      category: TRADE_MESSAGE.sell.TP,
      shouldExit: true,
    });
  });

  it("uses stopLossPercent only when it is greater than 0", () => {
    expect(
      resolveBacktestExitDecision({
        currentPrice: 80,
        forceSell: false,
        globalLiquidation: false,
        modelConfig: {
          orderType: "taker",
          stopLossPercent: 0,
          takeProfitPercent: 5,
        },
        position: position(),
      }).shouldExit,
    ).toBe(false);

    expect(
      resolveBacktestExitDecision({
        currentPrice: 80,
        forceSell: false,
        globalLiquidation: false,
        modelConfig: {
          orderType: "taker",
          stopLossPercent: 20,
          takeProfitPercent: 5,
        },
        position: position(),
      }),
    ).toMatchObject({
      category: TRADE_MESSAGE.sell.SL,
      exitPrice: 80,
      shouldExit: true,
    });
  });

  it("uses useStopLossPlus to gate trailing profit-lock exits", async () => {
    const current = [2, "103", "103", "103", "103", "1"] as any;
    const enabledMemory = memory();
    enabledMemory["SUI-peakGain"] = 0.05;
    const disabledMemory = memory();
    disabledMemory["SUI-peakGain"] = 0.05;

    await expect(
      dynamicExit({
        config: {
          orderType: "taker",
          stopLossPercent: 0,
          takeProfitPercent: 2,
          useStopLossPlus: true,
        },
        current,
        exchangeType: "binance",
        memory: enabledMemory,
        symbol: "SUI",
        tradingMode: TradingMode.FUTURES,
      }),
    ).resolves.toMatchObject({
      action: "SELL",
      category: TRADE_MESSAGE.sell.SL_PLUS,
    });

    await expect(
      dynamicExit({
        config: {
          orderType: "taker",
          stopLossPercent: 0,
          takeProfitPercent: 2,
          useStopLossPlus: false,
        },
        current,
        exchangeType: "binance",
        memory: disabledMemory,
        symbol: "SUI",
        tradingMode: TradingMode.FUTURES,
      }),
    ).resolves.toMatchObject({
      action: "HOLD",
    });
  });
});
