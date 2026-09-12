import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendError: vi.fn().mockResolvedValue(undefined),
  central: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/trading", () => ({
  default: {
    notif: {
      central: mocks.central,
    },
  },
}));

vi.mock("@/lib/trading/helper/log", () => ({
  tradeLog: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/slowTrading/storage", () => ({
  default: {
    logs: {
      appendError: mocks.appendError,
    },
  },
}));

import slowTradingNotifications from "@/lib/slowTrading/notifications";
import { BinanceCooldownError } from "@/lib/exchange/platform/binance/request-coordinator";

describe("Binance cooldown notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records and emits one dedicated notification for all callers in the same cooldown", async () => {
    const currentTimeMs = Date.UTC(2026, 8, 2, 12, 58);
    const retryAt = Date.UTC(2026, 8, 2, 13);
    const first = new BinanceCooldownError({
      activated: true,
      code: -1003,
      reason: "IP banned",
      retryAt,
      status: 418,
    });
    const repeated = new BinanceCooldownError({
      reason: "IP banned",
      retryAt,
    });

    await slowTradingNotifications.operationalError.notify({
      source: "cycle.account.1",
      error: first,
    });
    await slowTradingNotifications.operationalError.notify({
      source: "cycle.account.2",
      error: repeated,
    });

    // PROD:BINANCE_GLOBAL_COOLDOWN
    expect(mocks.appendError).toHaveBeenCalledTimes(1);
    expect(mocks.central).toHaveBeenCalledTimes(1);
    expect(mocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "NOTIF_BINANCE_COOLDOWN",
        title: expect.stringContaining("[BINANCE COOLDOWN]"),
        message: expect.stringContaining("Open again: 2 Sept 2026, 20:00 WIB"),
      }),
    );

    expect(
      slowTradingNotifications.binanceCooldown.build({
        currentTimeMs,
        reason: "Too many requests",
        retryAt,
      }),
    ).toEqual({
      title: "[BINANCE COOLDOWN] 2 minutes · opens 2 Sept 2026, 20:00 WIB",
      message: [
        "Binance cooldown: 2 minutes",
        "Open again: 2 Sept 2026, 20:00 WIB (Jakarta time)",
        "Reason: Too many requests",
      ].join("\n"),
    });
  });

  it("does not notify for callers that only observe an active cooldown", async () => {
    const error = new BinanceCooldownError({
      reason: "Already cooling down",
      retryAt: Date.UTC(2026, 8, 3, 13),
    });

    await slowTradingNotifications.operationalError.notify({
      source: "cycle.account.observer",
      error,
    });

    expect(mocks.appendError).not.toHaveBeenCalled();
    expect(mocks.central).not.toHaveBeenCalled();
  });
});
