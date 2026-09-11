import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  cooldown: vi.fn(),
  loadLogs: vi.fn(),
  loadStorage: vi.fn(),
}));

vi.mock("@/lib/slowTrading", () => ({
  default: {
    signals: {
      diagnostics: {
        build: mocks.build,
      },
    },
    storage: {
      data: {
        load: mocks.loadStorage,
      },
      logs: {
        appendError: vi.fn(),
        load: mocks.loadLogs,
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

  it("separates shared guards and diagnostics for every enabled account", async () => {
    const accounts = [
      { enabled: true, name: "Main", slug: "1" },
      { enabled: true, name: "Second", slug: "2" },
      { enabled: false, name: "Disabled", slug: "3" },
    ];
    const catalog = {
      runtime: {
        autoEntryEnabled: true,
        exchangeAccounts: accounts,
        runnerEnabled: true,
      },
    };
    const storages = {
      "1": { account: accounts[0] },
      "2": { account: accounts[1] },
    } as Record<string, unknown>;
    mocks.cooldown.mockReturnValue(null);
    mocks.loadStorage.mockImplementation(async ({ account }: any) =>
      account ? storages[account] : catalog,
    );
    mocks.loadLogs.mockResolvedValue({
      errors: [
        {
          createdAt: 123,
          id: "second-error",
          message: "Binance API Error: Invalid API-key (code: -2015)",
          source: "cycle.account.2",
          status: "new",
        },
      ],
    });
    mocks.build.mockImplementation(async ({ storage }: any) => [
      {
        code: "READY",
        level: -3,
        pointId: "point",
        reason: `Ready for ${storage.account.name}`,
        status: "ready",
        symbol: "LINK",
      },
    ]);
    const json = vi.fn();
    const response = {
      json,
      setHeader: vi.fn(),
      status: vi.fn(),
    } as any;
    response.status.mockReturnValue(response);

    await handler({ method: "GET" } as any, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(mocks.build).toHaveBeenCalledTimes(2);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        accounts: [
          expect.objectContaining({
            account: { name: "Main", slug: "1" },
            diagnostics: [expect.objectContaining({ reason: "Ready for Main" })],
          }),
          expect.objectContaining({
            account: { name: "Second", slug: "2" },
            diagnostics: [expect.objectContaining({ reason: "Ready for Second" })],
            latestExecutionError: {
              createdAt: 123,
              id: "second-error",
              message: "Binance API Error: Invalid API-key (code: -2015)",
            },
          }),
        ],
        sharedGuards: [
          expect.objectContaining({ code: "RUNNER_ENABLED", status: "ready" }),
          expect.objectContaining({
            code: "AUTO_ENTRY_ENABLED",
            status: "ready",
          }),
        ],
      }),
    );
  });
});
