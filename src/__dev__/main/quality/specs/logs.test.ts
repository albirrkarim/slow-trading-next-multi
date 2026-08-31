import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ExchangeModule from "@/lib/exchange";

let tmpRoot: string | null = null;

describe("slow specs logs", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-spec-logs-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    vi.doUnmock("@/lib/exchange");

    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.resetModules();
  });

  it("persists error, management, safe-haven, and withdrawal records", async () => {
    const storage = (await import("@/lib/slowTrading")).default.storage;
    const error = await storage.logs.appendError({
      source: "runner",
      error: "execution failed",
      timestamp: 1,
    });
    const safeHaven = await storage.logs.appendSafeHaven({
      account: "test-account",
      mode: "live",
      previousUSDT: 10,
      nextUSDT: 12,
      source: "settings",
      timestamp: 2,
    });
    const withdrawal = await storage.logs.appendWithdrawal({
      account: "test-account",
      trigger: "automatic",
      status: "executed",
      mode: "live",
      scheduleId: "schedule-1",
      amountUSDT: 2,
      message: "withdrawal executed",
      timestamp: 3,
    });
    const management = await storage.logs.appendManagement({
      action: "remove",
      symbol: "IOTX",
      source: "coin-management:auto-remove-min-price",
      reason: "Price fell below 0.1 USDT.",
      timestamp: 4,
    });

    const logs = await storage.logs.load();

    // PROD:ERROR_LOG
    expect(logs.errors).toContainEqual(error);
    expect(error.status).toBe("new");
    // PROD:MANAGEMENT_LOG
    expect(logs.management).toContainEqual(management);
    // PROD:SAFE_HAVEN_LOG
    expect(logs.safeHaven).toContainEqual(safeHaven);
    // PROD:WITHDRAWAL_LOG
    expect(logs.withdrawals).toContainEqual(withdrawal);
  });

  it("persists a realtime dashboard balance API failure and serves fallback state", async () => {
    const apiError = Object.assign(
      new Error(
        "Binance API Error: Invalid API-key, IP, or permissions for action (code: -2015)",
      ),
      { code: -2015 },
    );
    const getBalance = vi.fn().mockRejectedValue(apiError);

    vi.doMock("@/lib/exchange", async (importOriginal) => ({
      ...(await importOriginal<typeof ExchangeModule>()),
      getExchange: () => ({ getBalance }),
    }));

    const storageApi = (await import("@/lib/slowTrading")).default.storage;
    const storage = storageApi.data.createDefault();
    storage.config.exchangeType = "binance";
    storage.runtime.sandboxEnabled = false;
    storage.modes.live.dynamicTradeMemory.quoteAsset = 153.44;

    const dashboard = await storageApi.dashboard.buildStateRealtime(storage);
    const logs = await storageApi.logs.load();

    expect(dashboard.balances.availableQuoteAsset).toBe(153.44);
    expect(getBalance).toHaveBeenCalledWith("USDT_USDT");
    // PROD:ERROR_LOG
    expect(logs.errors).toContainEqual(
      expect.objectContaining({
        source: "slow-trading.dashboard.live-balance",
        message: apiError.message,
        stack: expect.stringContaining(apiError.message),
        details: expect.objectContaining({
          exchangeType: "binance",
          tradingMode: storage.config.tradingMode,
        }),
      }),
    );
  });

  it("deletes records from every persistent log without removing others", async () => {
    const storage = (await import("@/lib/slowTrading")).default.storage;
    const first = await storage.logs.appendError({
      source: "test",
      error: "first",
      timestamp: 1,
    });
    const second = await storage.logs.appendError({
      source: "test",
      error: "second",
      timestamp: 2,
    });
    const safeHaven = await storage.logs.appendSafeHaven({
      account: "test-account",
      mode: "live",
      previousUSDT: 1,
      nextUSDT: 2,
      source: "test",
      timestamp: 3,
    });
    const withdrawal = await storage.logs.appendWithdrawal({
      account: "test-account",
      trigger: "manual",
      status: "executed",
      mode: "live",
      scheduleId: "schedule-1",
      message: "test",
      timestamp: 4,
    });
    const management = await storage.logs.appendManagement({
      action: "add",
      symbol: "IOTX",
      source: "test",
      reason: "test",
      timestamp: 5,
    });

    const deleted = await Promise.all([
      storage.logs.deleteEntry("errors", first.id),
      storage.logs.deleteEntry("management", management.id),
      storage.logs.deleteEntry("safe_haven", safeHaven.id),
      storage.logs.deleteEntry("withdrawals", withdrawal.id),
    ]);
    const logs = await storage.logs.load();

    // PROD:LOG_RECORD_DELETE
    expect(deleted).toEqual([true, true, true, true]);
    expect(logs.errors.map((entry) => entry.id)).toEqual([second.id]);
    expect(logs.management).toEqual([]);
    expect(logs.safeHaven).toEqual([]);
    expect(logs.withdrawals).toEqual([]);
  });

  it("keeps dashboard log sections collapsed by default", async () => {
    const source = await fs.readFile(
      "src/components/LiveDashboard/Feature/SlowTradingLogs.tsx",
      "utf8",
    );

    expect(source).toContain("defaultExpanded={false}");
  });

  it("clears every record from only the selected log", async () => {
    const storage = (await import("@/lib/slowTrading")).default.storage;
    await storage.logs.appendError({ source: "test", error: "keep" });
    await storage.logs.appendWithdrawal({
      account: "test-account",
      trigger: "manual",
      status: "executed",
      mode: "live",
      scheduleId: "schedule-1",
      message: "delete",
    });
    await storage.logs.appendManagement({
      action: "remove",
      symbol: "IOTX",
      source: "test",
      reason: "delete",
    });

    const cleared = await storage.logs.clearEntries("management");
    const logs = await storage.logs.load();

    // PROD:LOG_DELETE_ALL
    expect(cleared).toBe(1);
    expect(logs.management).toEqual([]);
    expect(logs.withdrawals).toHaveLength(1);
    expect(logs.errors).toHaveLength(1);
  });

  it("updates error statuses without changing other records", async () => {
    const storage = (await import("@/lib/slowTrading")).default.storage;
    const first = await storage.logs.appendError({
      source: "test",
      error: "first",
      timestamp: 1,
    });
    const second = await storage.logs.appendError({
      source: "test",
      error: "second",
      timestamp: 2,
    });

    const updated = await storage.logs.updateErrorStatuses(
      [first.id],
      "solved",
    );
    const logs = await storage.logs.load();

    // PROD:ERROR_LOG_TRIAGE
    expect(updated).toEqual({
      missingIds: [],
      updated: [{ ...first, status: "solved" }],
    });
    expect(logs.errors).toEqual([
      second,
      { ...first, status: "solved" },
    ]);
  });

  it("does not partially update error statuses when an id is missing", async () => {
    const storage = (await import("@/lib/slowTrading")).default.storage;
    const error = await storage.logs.appendError({
      source: "test",
      error: "keep new",
    });

    expect(
      await storage.logs.updateErrorStatuses(
        [error.id, "missing"],
        "dismissed",
      ),
    ).toEqual({ missingIds: ["missing"], updated: [] });
    expect((await storage.logs.load()).errors).toEqual([error]);
  });
});
