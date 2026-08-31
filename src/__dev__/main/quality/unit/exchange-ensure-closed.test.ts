import { BinanceAdapter, TradingMode, UnifiedOrderSide } from "@/lib/exchange";
import { afterEach, beforeEach, vi } from "vitest";

function createExchangePosition(params?: {
  amount?: number;
  side?: "LONG" | "SHORT";
}) {
  return {
    symbol: "W_USDT",
    originalSymbol: "WUSDT",
    side: params?.side ?? "LONG",
    amount: params?.amount ?? 1,
    entryPrice: 1,
    sizeUSDT: 1,
    marginUSDT: 1,
    liquidationPrice: 0,
  } as const;
}

describe("live futures exit confirmation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries the exact exchange-reported residual as reduce-only", async () => {
    const residual = createExchangePosition({ amount: 1.25 });
    const getPositions = vi
      .fn()
      .mockResolvedValueOnce([residual])
      .mockResolvedValueOnce([]);
    const createOrder = vi.fn().mockResolvedValue({ orderId: "retry" });
    const exchange = new BinanceAdapter({
      defaultTradingMode: TradingMode.FUTURES,
    });
    exchange.getPositions = getPositions;
    exchange.createOrder = createOrder;

    const confirmation = exchange.ensureClosed({
      direction: "LONG",
      symbol: "W_USDT",
    });
    await vi.runAllTimersAsync();
    const result = await confirmation;

    // PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE
    expect(result).toEqual({
      closed: true,
      remainingAmount: 0,
      retryOrders: 1,
    });
    expect(getPositions).toHaveBeenCalledTimes(2);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 1.25,
        reduceOnly: true,
        side: UnifiedOrderSide.SELL,
        tradingMode: TradingMode.FUTURES,
      }),
    );
  });

  it("reports a residual that remains after the bounded retry", async () => {
    const residual = createExchangePosition({
      amount: 0.5,
      side: "SHORT",
    });
    const getPositions = vi.fn().mockResolvedValue([residual]);
    const createOrder = vi.fn().mockResolvedValue({ orderId: "retry" });

    const exchange = new BinanceAdapter({
      defaultTradingMode: TradingMode.FUTURES,
    });
    exchange.getPositions = getPositions;
    exchange.createOrder = createOrder;

    const confirmation = exchange.ensureClosed({
      direction: "SHORT",
      symbol: "W_USDT",
    });
    await vi.runAllTimersAsync();
    const result = await confirmation;

    // PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE
    expect(result).toEqual({
      closed: false,
      remainingAmount: 0.5,
      retryOrders: 1,
    });
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 0.5,
        reduceOnly: true,
        side: UnifiedOrderSide.BUY,
      }),
    );
  });
});
