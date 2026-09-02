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

describe("Binance cooldown operational notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records and emits one error for all callers in the same cooldown", async () => {
    const retryAt = Date.UTC(2026, 8, 2, 13);
    const first = new BinanceCooldownError({
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
  });
});
