import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendError: vi.fn(async () => undefined),
  refreshAccount: vi.fn(async (account: string) => ({
    account,
    availableQuoteAsset: 250,
    refreshedAt: 1,
  })),
}));

vi.mock("@/lib/slowTrading", () => ({
  default: {
    balance: {
      live: {
        refreshAccount: mocks.refreshAccount,
      },
    },
    storage: {
      logs: {
        appendError: mocks.appendError,
      },
    },
  },
}));

import handler from "@/pages/api/slow-trading/balance-refresh";

describe("manual balance refresh API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes only the requested account", async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      body: { account: "alpha" },
      method: "POST",
    } as unknown as NextApiRequest;
    const res = { status } as unknown as NextApiResponse;

    await handler(req, res);

    // PROD:MANUAL_ACCOUNT_BALANCE_REFRESH
    expect(mocks.refreshAccount).toHaveBeenCalledWith("alpha");
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      account: "alpha",
      availableQuoteAsset: 250,
      refreshedAt: 1,
    });
  });

  it("rejects a request without an account", async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      body: {},
      method: "POST",
    } as unknown as NextApiRequest;
    const res = { status } as unknown as NextApiResponse;

    await handler(req, res);

    expect(mocks.refreshAccount).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: "Account is required" });
  });
});
