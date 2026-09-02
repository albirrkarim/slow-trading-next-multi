import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("@lib/trading", () => ({
  tradeLog: {
    error: mocks.error,
  },
}));

import binanceRequestCoordinator, {
  BinanceCooldownError,
} from "@/lib/exchange/platform/binance/request-coordinator";

function response<T>(data: T, headers: Record<string, string> = {}) {
  return {
    data,
    headers,
  } as any;
}

describe("Binance request coordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 2, 12));
    binanceRequestCoordinator.state.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    binanceRequestCoordinator.state.reset();
    vi.useRealTimers();
  });

  it("uses endpoint-aware Binance request weights", () => {
    // PROD:BINANCE_REQUEST_COORDINATOR
    expect(
      binanceRequestCoordinator.request.weight({
        domain: "https://fapi.binance.com",
        endpoint: "/fapi/v1/klines",
        kind: "public",
        params: { limit: 500 },
      }),
    ).toBe(5);
    expect(
      binanceRequestCoordinator.request.weight({
        domain: "https://fapi.binance.com",
        endpoint: "/fapi/v1/ticker/24hr",
        kind: "public",
        params: {},
      }),
    ).toBe(40);
    expect(
      binanceRequestCoordinator.request.weight({
        domain: "https://fapi.binance.com",
        endpoint: "/fapi/v1/ticker/24hr",
        kind: "public",
        params: { symbol: "BTCUSDT" },
      }),
    ).toBe(1);
  });

  it("activates one cooldown and blocks later REST callbacks", async () => {
    const bannedUntil = Date.now() + 20 * 60_000;
    const firstRequest = vi.fn().mockRejectedValue({
      response: {
        data: {
          code: -1003,
          msg: `Way too many requests; IP banned until ${bannedUntil}`,
        },
        status: 418,
      },
    });

    await expect(
      binanceRequestCoordinator.request.run(
        {
          domain: "https://fapi.binance.com",
          endpoint: "/fapi/v1/klines",
          kind: "public",
          params: { limit: 500 },
        },
        firstRequest,
      ),
    ).rejects.toMatchObject({
      code: -1003,
      retryAt: bannedUntil,
    });

    const blockedRequest = vi.fn().mockResolvedValue(response({ ok: true }));
    await expect(
      binanceRequestCoordinator.request.run(
        {
          domain: "https://fapi.binance.com",
          endpoint: "/fapi/v2/balance",
          kind: "private",
          params: {},
        },
        blockedRequest,
      ),
    ).rejects.toBeInstanceOf(BinanceCooldownError);

    // PROD:BINANCE_GLOBAL_COOLDOWN
    expect(firstRequest).toHaveBeenCalledTimes(1);
    expect(blockedRequest).not.toHaveBeenCalled();
    expect(binanceRequestCoordinator.cooldown.get()).toEqual({
      reason: `Way too many requests; IP banned until ${bannedUntil}`,
      retryAt: bannedUntil,
    });
    expect(mocks.error).toHaveBeenCalledTimes(1);
  });

  it("does not classify rate limits as retryable failures", () => {
    // PROD:BINANCE_RATE_LIMIT_NO_RETRY
    expect(
      binanceRequestCoordinator.error.isRetryable({
        response: { status: 429 },
      }),
    ).toBe(false);
    expect(
      binanceRequestCoordinator.error.isRetryable({ code: "ECONNRESET" }),
    ).toBe(true);
    expect(
      binanceRequestCoordinator.error.isRetryable({
        response: { status: 503 },
      }),
    ).toBe(true);
    expect(
      binanceRequestCoordinator.error.isRetryable(new Error("bad request")),
    ).toBe(false);
  });

  it("defers requests after response headers report critical weight usage", async () => {
    await binanceRequestCoordinator.request.run(
      {
        domain: "https://fapi.binance.com",
        endpoint: "/fapi/v1/time",
        kind: "public",
      },
      async () => response({}, { "x-mbx-used-weight-1m": "2159" }),
    );

    const nextRequest = vi.fn().mockResolvedValue(response({ ok: true }));
    const pending = binanceRequestCoordinator.request.run(
      {
        domain: "https://fapi.binance.com",
        endpoint: "/fapi/v1/time",
        kind: "public",
      },
      nextRequest,
    );
    await Promise.resolve();
    expect(nextRequest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_049);
    expect(nextRequest).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(nextRequest).toHaveBeenCalledTimes(1);
  });
});
