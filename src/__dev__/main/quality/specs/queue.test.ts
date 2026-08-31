import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpRoot: string | null = null;

describe("slow specs persistent queues", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-spec-queue-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    process.env.DISABLE_SLOW_TRADING_RUNNER = "1";
    vi.resetModules();
  });

  afterEach(async () => {
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    delete process.env.DISABLE_SLOW_TRADING_RUNNER;
    vi.resetModules();
  });

  it("persists one scheduled Safe Haven item and waits until the next month after cancellation", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = false;
    storage.runtime.safeHaven = {
      autoEnabled: true,
      schedules: [
        {
          id: "profit-reserve",
          name: "Profit Reserve",
          enabled: true,
          amountUSDT: 25,
          pct: 0,
          dayOfMonth: 1,
        },
      ],
    };
    storage.config.modelConfig.minimalAssetOnTrade = undefined;
    storage.modes.live.dynamicTradeMemory.quoteAsset = 100;
    await slowTrading.storage.data.save(storage);

    const july = Date.UTC(2026, 6, 1, 12);
    await slowTrading.queue.scheduler.synchronize(july);
    let queues = await slowTrading.queue.items.load();

    // BOTH:SAFE_HAVEN_QUEUE
    expect(queues.safeHaven).toHaveLength(1);
    expect(queues.safeHaven[0]).toEqual(
      expect.objectContaining({
        mode: "live",
        period: "2026-07",
        scheduleId: "profit-reserve",
        requestedUSDT: 25,
        remainingUSDT: 25,
      }),
    );
    expect(
      await fs.pathExists(path.join(tmpRoot!, "slow/queue.json")),
    ).toBe(true);

    await slowTrading.queue.items.cancel(
      "safe_haven",
      queues.safeHaven[0].id,
    );
    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 20));
    queues = await slowTrading.queue.items.load();
    expect(queues.safeHaven).toEqual([]);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 7, 1));
    queues = await slowTrading.queue.items.load();
    expect(queues.safeHaven).toHaveLength(1);
    expect(queues.safeHaven[0].period).toBe("2026-08");
  });

  it("creates an overdue Safe Haven schedule on the next active runner pass", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.safeHaven = {
      autoEnabled: true,
      schedules: [
        {
          id: "mid-month",
          name: "Mid Month",
          enabled: true,
          amountUSDT: 25,
          pct: 0,
          dayOfMonth: 10,
        },
      ],
    };
    storage.config.modelConfig.minimalAssetOnTrade = undefined;
    storage.modes.live.dynamicTradeMemory.quoteAsset = 100;
    await slowTrading.storage.data.save(storage);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 9));
    expect((await slowTrading.queue.items.load()).safeHaven).toEqual([]);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 16));
    const queues = await slowTrading.queue.items.load();
    expect(queues.safeHaven).toHaveLength(1);
    expect(queues.safeHaven[0].period).toBe("2026-07");
    expect(queues.safeHaven[0].scheduleId).toBe("mid-month");
  });

  it("creates multiple Safe Haven queue items in one month and uses 0-100 percentages", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.safeHaven = {
      autoEnabled: true,
      schedules: [
        {
          id: "fixed",
          name: "Fixed",
          enabled: true,
          amountUSDT: 10,
          pct: 0,
          dayOfMonth: 5,
        },
        {
          id: "percent",
          name: "Percent",
          enabled: true,
          amountUSDT: 0,
          pct: 10,
          dayOfMonth: 20,
        },
      ],
    };
    storage.config.modelConfig.minimalAssetOnTrade = 0;
    storage.modes.live.dynamicTradeMemory.quoteAsset = 200;
    await slowTrading.storage.data.save(storage);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 5));
    expect((await slowTrading.queue.items.load()).safeHaven).toHaveLength(1);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 20));
    const queues = await slowTrading.queue.items.load();
    expect(queues.safeHaven).toHaveLength(2);
    expect(
      queues.safeHaven.find((item) => item.scheduleId === "percent"),
    ).toEqual(expect.objectContaining({ requestedUSDT: 20 }));
  });

  it("migrates legacy Safe Haven fractions into 0-100 schedule percentages", async () => {
    const { normalizeSafeHavenConfig } =
      await import("@/lib/slowTrading/storage/safe-haven-config");

    const safeHaven = normalizeSafeHavenConfig(undefined, {
      safePercentPerMonth: 0.1,
    });

    expect(safeHaven.autoEnabled).toBe(true);
    expect(safeHaven.schedules[0]).toEqual(
      expect.objectContaining({
        id: "legacy-safe-haven",
        pct: 10,
        dayOfMonth: 1,
      }),
    );
  });

  it("partially completes sandbox Safe Haven work and deletes it after collection", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.safeHaven = {
      autoEnabled: true,
      schedules: [
        {
          id: "sandbox-reserve",
          name: "Sandbox Reserve",
          enabled: true,
          amountUSDT: 25,
          pct: 0,
          dayOfMonth: 1,
        },
      ],
    };
    storage.config.modelConfig.minimalAssetOnTrade = undefined;
    storage.modes.sandbox.dynamicTradeMemory.quoteAsset = 10;
    await slowTrading.storage.data.save(storage);

    const createdAt = Date.UTC(2026, 6, 1);
    await slowTrading.queue.scheduler.synchronize(createdAt);
    await slowTrading.queue.processor.processDue(createdAt);

    let queues = await slowTrading.queue.items.load();
    let persisted = await slowTrading.storage.data.load();
    expect(queues.safeHaven[0].remainingUSDT).toBe(15);
    expect(queues.safeHaven[0].mode).toBe("sandbox");
    expect(persisted.modes.sandbox.dynamicTradeMemory.safeHaven).toBe(10);

    persisted.modes.sandbox.dynamicTradeMemory.quoteAsset = 20;
    await slowTrading.storage.mode.saveState(
      "sandbox",
      persisted.modes.sandbox,
    );
    await slowTrading.queue.processor.processDue(
      createdAt + slowTrading.queue.scheduler.retryIntervalMs,
    );

    queues = await slowTrading.queue.items.load();
    persisted = await slowTrading.storage.data.load();
    expect(queues.safeHaven).toEqual([]);
    expect(persisted.modes.sandbox.dynamicTradeMemory.safeHaven).toBe(25);
    expect(persisted.modes.sandbox.dynamicTradeMemory.safeHavenRequest).toBe(0);
  });

  it("keeps independent live and sandbox Safe Haven queues", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = false;
    storage.runtime.safeHaven = {
      autoEnabled: true,
      schedules: [
        {
          id: "shared-reserve",
          name: "Shared Reserve",
          enabled: true,
          amountUSDT: 25,
          pct: 0,
          dayOfMonth: 1,
        },
      ],
    };
    storage.config.modelConfig.minimalAssetOnTrade = undefined;
    storage.modes.live.dynamicTradeMemory.quoteAsset = 100;
    storage.modes.sandbox.dynamicTradeMemory.quoteAsset = 100;
    await slowTrading.storage.data.save(storage);

    const createdAt = Date.UTC(2026, 6, 1);
    await slowTrading.queue.scheduler.synchronize(createdAt);

    const switched = await slowTrading.storage.data.load();
    switched.runtime.sandboxEnabled = true;
    await slowTrading.storage.data.save(switched);
    await slowTrading.queue.scheduler.synchronize(createdAt);

    const queues = await slowTrading.queue.items.load();
    expect(queues.safeHaven).toHaveLength(2);
    expect(queues.safeHaven.map((item) => item.mode).sort()).toEqual([
      "live",
      "sandbox",
    ]);
  });

  it("keeps an underfunded withdrawal pending without repeated logs or duplicate queues", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = false;
    storage.config.exchangeType = "binance";
    storage.config.modelConfig.safeUSDTPerMonth = undefined;
    storage.config.modelConfig.safePercentPerMonth = undefined;
    storage.runtime.withdrawal = {
      autoEnabled: true,
      walletBook: [],
      schedules: [
        {
          id: "monthly",
          name: "Monthly",
          enabled: true,
          amountUSDT: 25,
          dayOfMonth: 1,
          targetNetwork: "BSC",
          targetWalletAddress: "0x12345678901234567890",
        },
      ],
    };
    storage.modes.live.dynamicTradeMemory.quoteAsset = 95;
    storage.modes.live.dynamicTradeMemory.safeHaven = 5;
    await slowTrading.storage.data.save(storage);

    const createdAt = Date.UTC(2026, 6, 1);
    await slowTrading.queue.scheduler.synchronize(createdAt);
    await slowTrading.queue.scheduler.synchronize(createdAt + 1);
    let queues = await slowTrading.queue.items.load();

    // PROD:WITHDRAW_QUEUE
    expect(queues.withdrawals).toHaveLength(1);

    await slowTrading.queue.processor.processDue(createdAt);
    await slowTrading.queue.processor.processDue(
      createdAt + slowTrading.queue.scheduler.retryIntervalMs,
    );

    queues = await slowTrading.queue.items.load();
    const logs = await slowTrading.storage.logs.load();
    expect(queues.withdrawals).toHaveLength(1);
    expect(queues.withdrawals[0].lastMessage).toContain(
      "Waiting for Safe Haven balance",
    );
    expect(logs.withdrawals).toEqual([]);

    await slowTrading.queue.items.cancel(
      "withdrawal",
      queues.withdrawals[0].id,
    );
    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 31));
    expect((await slowTrading.queue.items.load()).withdrawals).toEqual([]);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 7, 1));
    expect((await slowTrading.queue.items.load()).withdrawals).toHaveLength(1);
  });

  it("clamps withdrawal day 31 to the final day of short UTC months", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = false;
    storage.config.exchangeType = "binance";
    storage.runtime.withdrawal = {
      autoEnabled: true,
      walletBook: [],
      schedules: [
        {
          id: "month-end",
          name: "Month End",
          enabled: true,
          amountUSDT: 25,
          dayOfMonth: 31,
          targetNetwork: "BSC",
          targetWalletAddress: "0x12345678901234567890",
        },
      ],
    };
    await slowTrading.storage.data.save(storage);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 1, 27));
    expect((await slowTrading.queue.items.load()).withdrawals).toEqual([]);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 1, 28));
    let queues = await slowTrading.queue.items.load();
    expect(queues.withdrawals).toHaveLength(1);

    await slowTrading.queue.items.cancel(
      "withdrawal",
      queues.withdrawals[0].id,
    );
    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 2, 30));
    expect((await slowTrading.queue.items.load()).withdrawals).toEqual([]);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 2, 31));
    queues = await slowTrading.queue.items.load();
    expect(queues.withdrawals).toHaveLength(1);
  });

  it("creates an overdue monthly withdrawal on the next active runner pass", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = false;
    storage.config.exchangeType = "binance";
    storage.runtime.withdrawal = {
      autoEnabled: true,
      walletBook: [],
      schedules: [
        {
          id: "hosting",
          name: "Hosting",
          enabled: true,
          amountUSDT: 11,
          dayOfMonth: 11,
          targetNetwork: "BSC",
          targetWalletAddress: "0x12345678901234567890",
        },
      ],
    };
    await slowTrading.storage.data.save(storage);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 10));
    expect((await slowTrading.queue.items.load()).withdrawals).toEqual([]);

    await slowTrading.queue.scheduler.synchronize(Date.UTC(2026, 6, 12));
    const queues = await slowTrading.queue.items.load();
    expect(queues.withdrawals).toHaveLength(1);
    expect(queues.withdrawals[0].scheduleId).toBe("hosting");
  });

  it("migrates legacy withdrawal intervals into monthly calendar days", async () => {
    const { normalizeWithdrawalConfig } =
      await import("@/lib/slowTrading/storage/withdrawal-config");
    const withdrawal = normalizeWithdrawalConfig({
      autoEnabled: true,
      schedules: [
        {
          id: "legacy",
          name: "Legacy",
          enabled: true,
          amountUSDT: 10,
          intervalDays: 30,
          targetNetwork: "BSC",
          targetWalletAddress: "0x12345678901234567890",
        },
      ],
    });

    expect(withdrawal.schedules[0].dayOfMonth).toBe(30);
    expect(withdrawal.schedules[0]).not.toHaveProperty("intervalDays");
  });

  it("manually creates a Safe Haven queue and marks the current month handled", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    await slowTrading.storage.data.save(storage);

    const createdAt = Date.UTC(2026, 6, 15);
    const item = await slowTrading.queue.items.createManual(
      {
        kind: "safe_haven",
        amountUSDT: 12.5,
      },
      createdAt,
    );
    const persisted = await slowTrading.storage.data.load();

    expect(item).toEqual(
      expect.objectContaining({
        kind: "safe_haven",
        mode: "live",
        requestedUSDT: 12.5,
        remainingUSDT: 12.5,
      }),
    );
    expect(persisted.modes.live.dynamicTradeMemory.safeHavenRequest).toBe(12.5);
    expect(
      persisted.modes.live.dynamicTradeMemory.lastSafeHavenRequest,
    ).toBe(createdAt);
    await expect(
      slowTrading.queue.items.createManual(
        {
          kind: "safe_haven",
          amountUSDT: 1,
        },
        createdAt + 1,
      ),
    ).rejects.toThrow("already pending");
  });

  it("manually creates a withdrawal queue from an existing schedule", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.withdrawal = {
      autoEnabled: false,
      walletBook: [
        {
          id: "wallet-1",
          name: "Wallet",
          network: "BSC",
          address: "0x12345678901234567890",
        },
      ],
      schedules: [
        {
          id: "schedule-1",
          name: "Monthly",
          enabled: true,
          amountUSDT: 25,
          dayOfMonth: 15,
          walletId: "wallet-1",
          targetNetwork: "",
          targetWalletAddress: "",
        },
      ],
    };
    await slowTrading.storage.data.save(storage);

    const createdAt = Date.UTC(2026, 6, 15);
    const item = await slowTrading.queue.items.createManual(
      {
        kind: "withdrawal",
        scheduleId: "schedule-1",
      },
      createdAt,
    );
    const persisted = await slowTrading.storage.data.load();

    expect(item).toEqual(
      expect.objectContaining({
        kind: "withdrawal",
        scheduleId: "schedule-1",
        amountUSDT: 25,
        targetNetwork: "BSC",
        targetWalletAddress: "0x12345678901234567890",
      }),
    );
    expect(
      persisted.runtime.withdrawal.schedules[0].lastQueuedAt,
    ).toBe(createdAt);
  });
});
