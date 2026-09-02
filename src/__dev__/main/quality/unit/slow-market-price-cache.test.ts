import slowTradingMarket from "@/lib/slowTrading/market";
import slowTradingPublicMarketCache from "@/lib/slowTrading/public-market-cache";
import type { IExchange } from "@/lib/exchange";
import { beforeEach, describe, expect, it, vi } from "vitest";

function kline(price: string) {
  return [0, price, price, price, price, "1", 1, "1", 1, "1", "1", "0"] as any;
}

describe("SLOW latest public price cache", () => {
  beforeEach(() => {
    slowTradingPublicMarketCache.state.clear();
  });

  it("coalesces the same latest-price request across consumers", async () => {
    const getKlines = vi.fn().mockResolvedValue([kline("123.45")]);
    const exchange = {
      exchangeType: "binance",
      getKlines,
    } as unknown as IExchange;
    const params = {
      exchange,
      marketType: "FUTURES" as const,
      symbols: ["SOL"],
    };

    const [first, second] = await Promise.all([
      slowTradingMarket.price.buildLatestBySymbol(params),
      slowTradingMarket.price.buildLatestBySymbol(params),
    ]);

    // PROD:SHARED_MARKET_SINGLE_FLIGHT
    expect(first).toEqual({ SOL: 123.45 });
    expect(second).toEqual(first);
    expect(getKlines).toHaveBeenCalledTimes(1);
  });
});
