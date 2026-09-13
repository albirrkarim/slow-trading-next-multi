import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendError: vi.fn(async () => undefined),
  reset: vi.fn(async () => ({ current: null, logs: [] })),
}));

vi.mock("@/lib/slowTrading", () => ({
  default: {
    binanceHealth: { reset: mocks.reset },
    storage: { logs: { appendError: mocks.appendError } },
  },
}));

import handler from "@/pages/api/slow-trading/binance-cooldown-reset";

describe("Binance cooldown reset API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets the shared cooldown and returns current health", async () => {
    const end = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ end, json }));
    const setHeader = vi.fn();
    const req = { method: "POST" } as NextApiRequest;
    const res = { setHeader, status } as unknown as NextApiResponse;

    await handler(req, res);

    // PROD:BINANCE_MANUAL_COOLDOWN_RESET
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ current: null, logs: [] });
  });
});
