import {
  TradingMode,
  UnifiedOrderSide,
  UnifiedOrderType,
} from "@/lib/exchange";
import { BinanceAdapter } from "@/lib/exchange/adapters/binance";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createFuturesOrder: vi.fn(),
  getFuturesSymbolInfo: vi.fn(),
}));

vi.mock("@/lib/exchange/platform/binance", () => ({
  binance: {
    futures: { createFuturesOrder: mocks.createFuturesOrder },
  },
}));

vi.mock("@/lib/exchange/platform/binance/futures/exchangeInfo", () => ({
  getFuturesSymbolInfo: mocks.getFuturesSymbolInfo,
}));

describe("Binance futures reduce-only exits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFuturesSymbolInfo.mockResolvedValue({
      minQty: 1,
      stepSize: 1,
      tickSize: 0.000001,
    });
    mocks.createFuturesOrder.mockResolvedValue({
      orderId: 1,
      clientOrderId: "exit",
      status: "FILLED",
      executedQty: "10",
      avgPrice: "1",
      updateTime: 1,
      origQty: "10",
    });
  });

  it("forwards reduceOnly to the Binance futures API", async () => {
    const exchange = new BinanceAdapter({
      defaultTradingMode: TradingMode.FUTURES,
    });

    await exchange.createOrder({
      tradeType: "EXIT",
      symbol: "W_USDT",
      side: UnifiedOrderSide.SELL,
      type: UnifiedOrderType.MARKET,
      quantity: 10,
      tradingMode: TradingMode.FUTURES,
      reduceOnly: true,
    });

    // PROD:CONFIRM_FUTURES_EXIT_ON_EXCHANGE
    expect(mocks.createFuturesOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: "10",
        reduceOnly: true,
        symbol: "WUSDT",
      }),
    );
  });
});
