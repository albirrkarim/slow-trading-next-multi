import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  cooldown: vi.fn(),
}));

vi.mock("@/lib/slowTrading", () => ({
  default: {
    signals: {
      diagnostics: {
        build: mocks.build,
      },
    },
    storage: {
      logs: {
        appendError: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/exchange/platform/binance/request-coordinator", () => ({
  BinanceCooldownError: class BinanceCooldownError extends Error {
    retryAt = 0;
  },
  default: {
    cooldown: {
      get: mocks.cooldown,
    },
  },
}));

vi.mock("@/lib/trading/helper/log", () => ({
  tradeLog: { error: vi.fn() },
}));

import handler from "@/pages/api/slow-trading/entry-diagnostics";

describe("entry diagnostics Binance cooldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns retryAt without starting diagnostics", async () => {
    const retryAt = Date.UTC(2026, 8, 2, 13);
    mocks.cooldown.mockReturnValue({ reason: "IP banned", retryAt });
    const json = vi.fn();
    const response = {
      json,
      setHeader: vi.fn(),
      status: vi.fn(),
    } as any;
    response.status.mockReturnValue(response);

    await handler({ method: "GET" } as any, response);

    // PROD:BINANCE_GLOBAL_COOLDOWN
    expect(response.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: "Binance cooldown",
      retryAt,
    });
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
