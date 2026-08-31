import exchangeFundingRate from "@/lib/exchange/funding-rate";
import { BinanceAdapter } from "@/lib/exchange/adapters/binance";
import { TradingMode } from "@/lib/exchange";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("exchange funding-rate cache", () => {
  beforeEach(() => {
    exchangeFundingRate.cache.clear();
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 9, 0, 0));
  });

  afterEach(() => {
    exchangeFundingRate.cache.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("coalesces all-symbol funding requests for five minutes", async () => {
    // PROD:MONITORING_POSITION_FUNDING_RATE
    const getFundingRates = vi
      .spyOn(BinanceAdapter.prototype, "getFundingRates")
      .mockResolvedValue([
        {
          nextFundingTime: Date.UTC(2026, 7, 9, 8),
          rate: -0.0005,
          symbol: "IOTX_USDT",
          t: Date.UTC(2026, 7, 9, 0),
        },
      ]);
    const params = {
      exchangeType: "binance" as const,
      tradingMode: TradingMode.FUTURES,
      symbols: ["IOTX"],
    };

    const [first, concurrent] = await Promise.all([
      exchangeFundingRate.latest.map(params),
      exchangeFundingRate.latest.map(params),
    ]);

    expect(first).toEqual(concurrent);
    expect(getFundingRates).toHaveBeenCalledTimes(1);
    expect(getFundingRates).toHaveBeenCalledWith();

    vi.advanceTimersByTime(exchangeFundingRate.cache.ttlMs - 1);
    await exchangeFundingRate.latest.map(params);
    expect(getFundingRates).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await exchangeFundingRate.latest.map(params);
    expect(getFundingRates).toHaveBeenCalledTimes(2);
  });

  it("backs off after failure and serves the last snapshot", async () => {
    const getFundingRates = vi
      .spyOn(BinanceAdapter.prototype, "getFundingRates")
      .mockResolvedValueOnce([
        {
          rate: 0.0001,
          symbol: "BTC_USDT",
          t: Date.UTC(2026, 7, 9, 0),
        },
      ])
      .mockRejectedValueOnce(new Error("temporary Binance failure"))
      .mockResolvedValue([
        {
          rate: 0.0002,
          symbol: "BTC_USDT",
          t: Date.UTC(2026, 7, 9, 0, 10),
        },
      ]);
    const params = {
      exchangeType: "binance" as const,
      tradingMode: TradingMode.FUTURES,
      symbols: ["BTC"],
    };

    const first = await exchangeFundingRate.latest.map(params);
    vi.advanceTimersByTime(exchangeFundingRate.cache.ttlMs);
    await expect(exchangeFundingRate.latest.map(params)).rejects.toThrow(
      "temporary Binance failure",
    );

    expect(await exchangeFundingRate.latest.map(params)).toEqual(first);
    expect(getFundingRates).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(exchangeFundingRate.cache.ttlMs);
    expect(
      (await exchangeFundingRate.latest.map(params)).BTC?.rate,
    ).toBe(0.0002);
    expect(getFundingRates).toHaveBeenCalledTimes(3);
  });
});
