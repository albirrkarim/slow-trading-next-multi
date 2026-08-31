import type { NextApiRequest, NextApiResponse } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendError: vi.fn(async () => undefined),
  appendManagement: vi.fn(async () => undefined),
  build: vi.fn(() => [
    {
      action: "add",
      reason: "Configured Symbols list was updated through the dashboard storage API.",
      source: "dashboard.coin-management",
      symbol: "IOTX",
    },
  ]),
  buildStateRealtime: vi.fn(async () => ({ activeMode: "live" })),
  load: vi.fn(),
  notify: vi.fn(async () => undefined),
  runnerGet: vi.fn(async () => undefined),
  update: vi.fn(async () => undefined),
}));

vi.mock("@/lib/slowTrading", () => ({
  default: {
    notifications: {
      managementAction: {
        build: mocks.build,
        notify: mocks.notify,
      },
    },
    runner: { get: mocks.runnerGet },
    storage: {
      dashboard: { buildStateRealtime: mocks.buildStateRealtime },
      data: { load: mocks.load, update: mocks.update },
      logs: {
        appendError: mocks.appendError,
        appendManagement: mocks.appendManagement,
      },
    },
  },
}));

import handler from "@/pages/api/slow-trading/storage";

describe("storage API management-action notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load
      .mockResolvedValueOnce({ config: { symbols: ["AAVE"] } })
      .mockResolvedValueOnce({
        config: { symbols: ["AAVE", "IOTX"] },
        runtime: { notification: { email: {}, telegram: {} } },
      });
  });

  it("notifies additions and removals with the dashboard source", async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      body: { symbols: ["AAVE", "IOTX"] },
      method: "PUT",
    } as unknown as NextApiRequest;
    const res = { status } as unknown as NextApiResponse;

    await handler(req, res);

    expect(mocks.build).toHaveBeenCalledWith({
      previousSymbols: ["AAVE"],
      nextSymbols: ["AAVE", "IOTX"],
      reason:
        "Configured Symbols list was updated through the dashboard storage API.",
      source: "dashboard.coin-management",
    });
    expect(mocks.notify).toHaveBeenCalledWith({
      actions: expect.arrayContaining([
        expect.objectContaining({ action: "add", symbol: "IOTX" }),
      ]),
      notification: { email: {}, telegram: {} },
    });
    expect(mocks.appendManagement).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "add",
        reason:
          "Configured Symbols list was updated through the dashboard storage API.",
        source: "dashboard.coin-management",
        symbol: "IOTX",
      }),
    );
    expect(status).toHaveBeenCalledWith(200);
  });
});
