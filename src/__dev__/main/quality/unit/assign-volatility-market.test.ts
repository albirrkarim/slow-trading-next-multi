import { assignVolatility } from "@/components/api/production/utils";
import { TradingMode } from "@/lib/exchange";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(async () => false),
  predictionEngine: vi.fn(async ({ memory }) => memory),
  readJSON: vi.fn(),
  updateAtomic: vi.fn(async (_file: string, update: (value: unknown) => unknown) =>
    update(undefined),
  ),
}));

vi.mock("@/lib/dynamic", () => ({
  predictionEngine: mocks.predictionEngine,
}));

vi.mock("fs-extra", () => ({
  default: {
    exists: mocks.exists,
    readJSON: mocks.readJSON,
  },
}));

vi.mock("@/lib/slowTrading/storage/json-file", () => ({
  default: {
    update: {
      atomic: mocks.updateAtomic,
    },
  },
}));

import slowTradingPublicMarketCache from "@/lib/slowTrading/public-market-cache";

describe("production volatility market", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    slowTradingPublicMarketCache.state.clear();
    mocks.exists.mockResolvedValue(false);
    mocks.predictionEngine.mockImplementation(async ({ memory }) => memory);
    mocks.updateAtomic.mockImplementation(async (_file, update) =>
      update(undefined),
    );
  });

  it("passes the configured futures market to the prediction engine", async () => {
    await assignVolatility({}, ["AKT"], "binance", TradingMode.FUTURES, 1);

    // PROD:INITIALIZE_MARKET_TYPE
    expect(mocks.predictionEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeType: "binance",
        marketType: "FUTURES",
        minActionableAbsoluteLevel: 1,
        tradePair: "AKT_USDT",
      }),
    );
  });

  it("persists completed symbols before a later symbol fails", async () => {
    mocks.predictionEngine.mockImplementation(async ({ memory, tradePair }) => {
      if (tradePair === "ETH_USDT") {
        throw new Error("temporary failure");
      }
      memory.lastVolatility.push({
        id: "akt-point",
        l: "T",
        lvl: 1,
        p: 1,
        symbol: "AKT",
        t: 1,
      });
      return memory;
    });

    await expect(
      assignVolatility(
        {},
        ["AKT", "ETH"],
        "binance",
        TradingMode.FUTURES,
        1,
      ),
    ).rejects.toThrow("temporary failure");

    // PROD:VOLATILITY_INCREMENTAL_PERSISTENCE
    expect(mocks.updateAtomic).toHaveBeenCalledTimes(1);
    expect(mocks.updateAtomic.mock.calls[0]?.[0]).toMatch(/AKT\.json$/);
  });

  it("coalesces concurrent volatility calculations for one symbol", async () => {
    let finishPrediction: (() => void) | undefined;
    mocks.predictionEngine.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPrediction = () => resolve(undefined);
        }),
    );

    const first = assignVolatility(
      {},
      ["AKT"],
      "binance",
      TradingMode.FUTURES,
      1,
    );
    const second = assignVolatility(
      {},
      ["AKT"],
      "binance",
      TradingMode.FUTURES,
      1,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.predictionEngine).toHaveBeenCalledTimes(1);

    finishPrediction?.();
    await Promise.all([first, second]);
    expect(mocks.updateAtomic).toHaveBeenCalledTimes(1);
  });
});
