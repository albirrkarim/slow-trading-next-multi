import { assignVolatility } from "@/components/api/production/utils";
import { TradingMode } from "@/lib/exchange";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(async () => false),
  predictionEngine: vi.fn(async ({ memory }) => memory),
}));

vi.mock("@/lib/dynamic", () => ({
  predictionEngine: mocks.predictionEngine,
}));

vi.mock("fs-extra", () => ({
  default: {
    exists: mocks.exists,
    readJSON: vi.fn(),
  },
}));

describe("production volatility market", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
