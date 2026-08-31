import { prepareCommonTimeDataset } from "@/components/api/utils";
import { TradingMode } from "@/lib/exchange";
import { resolveMarketTypeForTradingMode } from "@/lib/exchange/utils";
import fs from "fs-extra";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cropKlinesToCommonRange: vi.fn(async () => ({
    commonEnd: 2,
    commonStart: 1,
  })),
  fetchKlines: vi.fn(async (_params: Record<string, unknown>) => []),
}));

vi.mock("@/lib/datasets/fetchKlines", () => ({
  fetchKlinesFunction: mocks.fetchKlines,
}));

vi.mock("@/lib/dynamic", () => ({
  cropKlinesToCommonRange: mocks.cropKlinesToCommonRange,
}));

describe("dashboard initialization market", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps futures execution to futures klines and margin execution to spot klines", () => {
    // PROD:INITIALIZE_MARKET_TYPE
    expect(resolveMarketTypeForTradingMode(TradingMode.FUTURES)).toBe(
      "FUTURES",
    );
    expect(resolveMarketTypeForTradingMode(TradingMode.SPOT)).toBe("SPOT");
    expect(resolveMarketTypeForTradingMode(TradingMode.MARGIN_ISOLATED)).toBe(
      "SPOT",
    );
  });

  it("passes the explicit futures market into initialization kline downloads", async () => {
    await prepareCommonTimeDataset({
      endTime: 2,
      exchangeType: "binance",
      interval: "5m",
      marketType: "FUTURES",
      range: "test-range",
      startTime: 1,
      symbols: ["AKT"],
      useCache: false,
      useCacheCommonTime: false,
    });

    // PROD:INITIALIZE_MARKET_TYPE
    expect(mocks.fetchKlines).toHaveBeenCalledWith(
      expect.objectContaining({
        marketType: "FUTURES",
        symbol: "AKT_USDT",
      }),
    );
    expect(mocks.fetchKlines.mock.calls[0]?.[0]?.folder).toContain(
      "binance/FUTURES",
    );
  });

  it("uses the compact volatility dataset throughout dynamic backtests", async () => {
    const sources = await Promise.all(
      [
        "src/lib/dynamic/backtest-volatility/index.ts",
        "src/lib/devBacktest/api/dynamicTradeBacktest.ts",
      ].map((filePath) => fs.readFile(filePath, "utf8")),
    );

    for (const source of sources) {
      // BTEST:BACKTEST_VOLATILITY_DATASET
      expect(source).toContain("BTEST:BACKTEST_VOLATILITY_DATASET");
      expect(source).not.toContain("prepareCommonTimeDataset(");
    }
  });
});
