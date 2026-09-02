import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getKlines: vi.fn(),
}));

vi.mock("@/lib/exchange", () => ({
  getExchange: () => ({ getKlines: mocks.getKlines }),
}));

vi.mock("@lib/trading", () => ({
  tradeLog: {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

import { fetchKlinesFunction } from "@/lib/datasets/fetchKlines";
import { BinanceCooldownError } from "@/lib/exchange/platform/binance/request-coordinator";

const startTime = Date.UTC(2026, 8, 2, 0);

function kline(t: number) {
  return [
    t,
    "1",
    "1",
    "1",
    "1",
    "1",
    t + 59_999,
    "1",
    1,
    "1",
    "1",
    "0",
  ] as any;
}

describe("historical kline retry classification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not retry a Binance cooldown", async () => {
    const cooldown = new BinanceCooldownError({
      code: -1003,
      reason: "IP banned",
      retryAt: startTime + 120_000,
      status: 418,
    });
    mocks.getKlines.mockRejectedValue(cooldown);

    await expect(
      fetchKlinesFunction({
        endTime: startTime + 60_000,
        exchangeType: "binance",
        interval: "1m",
        marketType: "FUTURES",
        startTime,
        symbol: "BTC_USDT",
        useCache: false,
      }),
    ).rejects.toBe(cooldown);

    // PROD:BINANCE_RATE_LIMIT_NO_RETRY
    expect(mocks.getKlines).toHaveBeenCalledTimes(1);
  });

  it("retries a temporary network failure with exponential backoff", async () => {
    mocks.getKlines
      .mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .mockResolvedValueOnce([kline(startTime)]);

    const result = fetchKlinesFunction({
      endTime: startTime + 60_000,
      exchangeType: "binance",
      interval: "1m",
      marketType: "FUTURES",
      startTime,
      symbol: "BTC_USDT",
      useCache: false,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(300);
    await expect(result).resolves.toHaveLength(1);
    expect(mocks.getKlines).toHaveBeenCalledTimes(2);
  });
});
