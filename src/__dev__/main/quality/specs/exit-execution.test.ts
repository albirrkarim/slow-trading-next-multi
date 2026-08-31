import { TradingMode } from "@/lib/exchange";
import { executeExit } from "@/lib/trading/execute/execute-exit";
import type { TradingModelMemory } from "@/lib/trading/models";
import { createTestPosition } from "../fixtures/position";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmation: vi.fn(),
  createOrder: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/lib/exchange", async () => {
  const actual = await vi.importActual<any>("@/lib/exchange");
  return {
    ...actual,
    getExchange: vi.fn(() => ({
      createOrder: mocks.createOrder,
      ensureClosed: mocks.confirmation,
      getFees: () => ({
        getBothSideFeePercent: () => 0,
        getTotalFeePercent: () => 0,
      }),
    })),
  };
});

vi.mock("@/lib/trading/helper/notification", () => ({
  notif: { central: mocks.notify },
}));

function createMemory(): TradingModelMemory {
  return {
    forceSell: true,
    positions: [
      createTestPosition({
        direction: "LONG",
        entryPrice: 1,
        executionMode: "live",
        quantity: 10,
        symbol: "W",
        tradingMode: TradingMode.FUTURES,
      }),
    ],
    positionsSell: [],
    volatility: {
      symbol: "W",
      lastVolatility: [],
    },
  } as TradingModelMemory;
}

const currentKline = [1_000, "1", "1", "1", "1", "10"] as any;
const modelConfig = {
  orderType: "taker" as const,
  stopLossPercent: 15,
  takeProfitPercent: 5,
};

describe("live exit execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createOrder.mockResolvedValue({ orderId: "initial-exit" });
    mocks.notify.mockResolvedValue(undefined);
  });

  it("keeps the local close only after exchange confirmation", async () => {
    const memory = createMemory();
    mocks.confirmation.mockResolvedValue({
      closed: true,
      remainingAmount: 0,
      retryOrders: 0,
    });

    const result = await executeExit({
      symbol: "W",
      current: currentKline,
      modelConfig,
      modelMemory: memory,
      exchangeType: "binance",
      tradingMode: TradingMode.FUTURES,
    });

    // PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE
    expect(mocks.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ reduceOnly: true }),
    );
    expect(memory.positions).toEqual([]);
    expect(memory.positionsSell).toHaveLength(1);
    expect(result.tradingDetail?.action).toBe("SELL");
  });

  it("restores the open position when exchange confirmation fails", async () => {
    const memory = createMemory();
    delete memory.forceSell;
    mocks.confirmation.mockResolvedValue({
      closed: false,
      remainingAmount: 1,
      retryOrders: 1,
    });

    const result = await executeExit({
      symbol: "W",
      current: [1_000, "1", "1", "0.8", "0.8", "10"] as any,
      modelConfig,
      modelMemory: memory,
      exchangeType: "binance",
      tradingMode: TradingMode.FUTURES,
    });

    // PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE
    expect(memory.positions).toHaveLength(1);
    expect(memory.positions[0].closed).toBeUndefined();
    expect(memory.positionsSell).toEqual([]);
    expect(memory.forceSell).toBeUndefined();
    expect(memory.positions[0].control?.forceExit?.reason).toContain(
      "not confirmed",
    );
    expect(result.tradingDetail).toBeUndefined();
    expect(result.message).toContain("EXIT ORDER FAILED");
  });
});
