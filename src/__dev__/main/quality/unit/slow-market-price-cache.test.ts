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

  it("sweeps expired values even when a different cache key is requested", async () => {
    await slowTradingPublicMarketCache.value.getOrLoad({
      expiresAt: 10,
      key: "expired-key",
      load: async () => "expired",
      now: 0,
    });

    await slowTradingPublicMarketCache.value.getOrLoad({
      expiresAt: 30,
      key: "fresh-key",
      load: async () => "fresh",
      now: 20,
    });

    // PROD:PUBLIC_MARKET_CACHE_BOUNDED
    expect(slowTradingPublicMarketCache.state.getStats()).toMatchObject({
      completedEntries: 1,
      inFlightEntries: 0,
    });
  });

  it("bounds completed process-lifetime cache entries", async () => {
    const stats = slowTradingPublicMarketCache.state.getStats();
    for (let index = 0; index < stats.maxCompletedEntries + 20; index += 1) {
      await slowTradingPublicMarketCache.value.getOrLoad({
        expiresAt: 1_000,
        key: `bounded-${index}`,
        load: async () => index,
        now: 0,
      });
    }

    // PROD:PUBLIC_MARKET_CACHE_BOUNDED
    expect(
      slowTradingPublicMarketCache.state.getStats().completedEntries,
    ).toBe(stats.maxCompletedEntries);
  });
});
