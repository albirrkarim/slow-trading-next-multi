import { normalizeBinanceFundingRates } from "@/lib/exchange/platform/binance/futures/funding";
import { describe, expect, it } from "vitest";

describe("Binance futures funding rates", () => {
  it("normalizes and filters the public premium-index snapshot", () => {
    // PROD:LATEST_VOLATILITY_FUNDING_RATE
    expect(
      normalizeBinanceFundingRates(
        [
          {
            lastFundingRate: "-0.0005",
            nextFundingTime: 2_000,
            symbol: "IOTXUSDT",
            time: 1_000,
          },
          {
            lastFundingRate: "0.0001",
            nextFundingTime: 2_000,
            symbol: "BTCUSDT",
            time: 1_000,
          },
          {
            lastFundingRate: "invalid",
            symbol: "SUIUSDT",
            time: 1_000,
          },
        ],
        ["IOTX_USDT", "SUIUSDT"],
      ),
    ).toEqual([
      {
        nextFundingTime: 2_000,
        rate: -0.0005,
        symbol: "IOTX_USDT",
        t: 1_000,
      },
    ]);
  });
});
