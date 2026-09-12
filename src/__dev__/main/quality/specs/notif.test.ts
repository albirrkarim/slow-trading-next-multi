import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, vi } from "vitest";
import { createTestPosition } from "../fixtures/position";

let tmpRoot: string | null = null;

async function expectSourceContains(filePath: string, markers: string[]) {
  const source = await fs.readFile(filePath, "utf8");

  for (const marker of markers) {
    expect(source).toContain(marker);
  }
}

describe("slow specs notification", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-spec-notif-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.resetModules();
  });

  it("marks entry notification success and failure paths", async () => {
    await expectSourceContains("src/lib/trading/execute/execute-entry.ts", [
      // PROD:NOTIF_ENTRY
      "key: notificationTarget.successKey",
      "title: sandboxMessage",
      "const sandboxMessage = `[SANDBOX]",
      // PROD:NOTIF_ENTRY_FAILED
      "key: notificationTarget.failureKey",
    ]);
  });

  it("marks exit notification success and failure paths", async () => {
    await expectSourceContains("src/lib/trading/execute/execute-exit.ts", [
      // PROD:NOTIF_EXIT
      "key: notificationTarget.successKey",
      "title: `[SANDBOX] ${message}`",
      // PROD:NOTIF_EXIT_FAILED
      "key: notificationTarget.failureKey",
    ]);
  });

  it("marks averaging notification success and failure paths", async () => {
    await expectSourceContains("src/lib/trading/execute/execute-averaging.ts", [
      // PROD:NOTIF_AVG
      'key: "NOTIF_AVERAGE"',
      "title: `[SANDBOX] ${message}`",
      // PROD:NOTIF_AVG_FAILED
      'key: "NOTIF_AVERAGE_FAILED"',
    ]);
  });

  it("marks monitoring and operational-error notification paths", async () => {
    await expectSourceContains("src/lib/slowTrading/notifications.ts", [
      // PROD:NOTIF_HIGH_VOLATILITY
      'key: "NOTIF_HIGH_VOLATILITY"',
      // PROD:NOTIF_STALE_POSITION
      'key: "NOTIF_STALE_POSITION"',
      // PROD:NOTIF_LONG_OPEN_POSITION
      'key: "NOTIF_LONG_OPEN_POSITION"',
      // PROD:NOTIF_ERROR
      'key: "NOTIF_ERROR"',
      // PROD:NOTIF_MANAGEMENT_ACTION
      'key: "NOTIF_MANAGEMENT_ACTION"',
      // PROD:NOTIF_DAILY_PERFORMANCE
      'key: "NOTIF_DAILY_PERFORMANCE"',
      // PROD:NOTIF_DAILY_PNL_LIMIT
      'key: "NOTIF_DAILY_PNL_LIMIT"',
      // PROD:NOTIF_BINANCE_COOLDOWN
      'key: "NOTIF_BINANCE_COOLDOWN"',
    ]);
    await expectSourceContains("src/lib/slowTrading/cycle/coordinator.ts", [
      "dailyPerformance.notify",
    ]);
    await expectSourceContains("src/lib/slowTrading/cycle/finalize.ts", [
      // PROD:BOUNDED_POST_CYCLE_ASYNC_WORK
      "PROD:BOUNDED_POST_CYCLE_ASYNC_WORK",
      "await slowTradingNotifications.openPositions",
      "await slowTradingStorage.balanceSnapshots.upsert",
    ]);
    await expectSourceContains("src/lib/slowTrading/cycle/entry.ts", [
      // PROD:BOUNDED_POST_CYCLE_ASYNC_WORK
      "PROD:BOUNDED_POST_CYCLE_ASYNC_WORK",
      "await slowTradingNotifications.highVolatility",
      "latestVolatilityPointsMap",
    ]);
  });

  it("marks the n8n CRM email delivery path", async () => {
    await expectSourceContains("src/lib/notification/index.ts", [
      // PROD:NOTIF_EMAIL_CRM_PROXY
      "sendEmailViaN8nProxy",
      "N8N_EMAIL_PROXY_URL",
      "PROD:NOTIF_EMAIL_CRM_PROXY",
      // PROD:NOTIFICATION_DELIVERY_RETRY
      "PROD:NOTIFICATION_DELIVERY_RETRY",
    ]);
  });

  it("checks and notifies public IP changes only from startup instrumentation", async () => {
    await expectSourceContains("src/instrumentation.ts", [
      // PROD:INSTANCE_IP_CHECK_ON_START
      "PROD:INSTANCE_IP_CHECK_ON_START",
      'import("@/lib/runtime/instance-ip")',
      ".default.lifecycle.check()",
    ]);
    await expectSourceContains("src/lib/runtime/instance-ip.ts", [
      // PROD:NOTIF_IP_CHANGED
      'key: "NOTIF_IP_CHANGED"',
      "https://api.ipify.org",
    ]);
  });

  it("keeps BTC helper high-volatility notification state between cycles", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.modes.live.highVolatilityNotificationState = {
      email: { BTC: "NEGATIVE" },
      telegram: { BTC: "NEGATIVE" },
    };

    await slowTradingStorage.data.save(storage);
    const loaded = await slowTradingStorage.data.load();

    // PROD:NOTIF_HIGH_VOLATILITY
    expect(loaded.modes.live.highVolatilityNotificationState).toEqual({
      email: { BTC: "NEGATIVE" },
      telegram: { BTC: "NEGATIVE" },
    });
  });

  it("reports the previous completed UTC day once per enabled channel", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const trading = (await import("@/lib/trading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.modes.live.tradeSettings[0]!.model_memory.positionsSell = [
      createTestPosition({
        entryTime: Date.UTC(2026, 5, 9, 1),
        netPct: 1,
        netUsdt: 7,
        closed: {
          feeUsdt: 0,
          price: 1.1,
          reason: "TAKE_PROFIT",
          t: Date.UTC(2026, 5, 9, 8),
        },
      }),
    ];
    await slowTrading.storage.mode.saveState("live", storage.modes.live);
    await slowTrading.storage.balanceSnapshots.upsert({
      account: storage.account.slug,
      mode: "live",
      timestamp: Date.UTC(2026, 5, 8, 23, 55),
      total: 100,
    });
    await slowTrading.storage.balanceSnapshots.upsert({
      account: storage.account.slug,
      mode: "live",
      timestamp: Date.UTC(2026, 5, 9, 23, 55),
      total: 104.53,
    });
    const loaded = await slowTrading.storage.data.load({ modeScope: "active" });
    const modeState = loaded.modes.live;
    const centralSpy = vi
      .spyOn(trading.notif, "central")
      .mockResolvedValue(undefined);

    await slowTrading.notifications.dailyPerformance.notify({
      accounts: [{ modeState, slug: loaded.account.slug }],
      currentTimeMs: Date.UTC(2026, 5, 10, 1),
      exchangeType: loaded.config.exchangeType,
      mode: "live",
      notification: loaded.runtime.notification,
    });

    expect(centralSpy).toHaveBeenCalledTimes(1);
    expect(centralSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        dedupeKey: "slow-daily-performance:telegram:live:2026-06-09",
        key: "NOTIF_DAILY_PERFORMANCE",
        title:
          "[DAILY] 9 Jun UTC | +$7.00 | +$7.00 -$0.00 | WR 100% (1W / 0L)",
        message: expect.stringContaining(
          "Trade PnL: +$7.00\nTrade PnL %: +1.00%\nTrades: 1\nWins: 1\nLosses: 0\nWin rate: 100.00%\nBalance PnL: +$4.53",
        ),
      }),
    );
    expect(modeState.dailyPerformanceNotificationState?.telegram).toBe(
      "2026-06-09",
    );

    await slowTrading.notifications.dailyPerformance.notify({
      accounts: [{ modeState, slug: loaded.account.slug }],
      currentTimeMs: Date.UTC(2026, 5, 10, 12),
      exchangeType: loaded.config.exchangeType,
      mode: "live",
      notification: loaded.runtime.notification,
    });
    expect(centralSpy).toHaveBeenCalledTimes(1);

    await slowTrading.storage.mode.saveState("live", modeState);
    const reloaded = await slowTrading.storage.data.load({ modeScope: "active" });
    expect(
      reloaded.modes.live.dailyPerformanceNotificationState?.telegram,
    ).toBe("2026-06-09");
  });

  it("aggregates daily performance across every selected account", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const trading = (await import("@/lib/trading")).default;
    const alphaState = slowTrading.storage.data.createDefault().modes.live;
    const betaState = slowTrading.storage.data.createDefault().modes.live;
    alphaState.dynamicTradeMemory.startingBalanceUSDT = 40;
    betaState.dynamicTradeMemory.startingBalanceUSDT = 60;
    const notification = slowTrading.storage.data.createDefault().runtime
      .notification;
    const reportDay = Date.UTC(2026, 5, 9, 8);

    vi.spyOn(slowTrading.storage.history, "readRange").mockResolvedValue([
      createTestPosition({
        account: "alpha",
        entryTime: reportDay - 60_000,
        netPct: 1,
        netUsdt: 7,
        closed: {
          feeUsdt: 0,
          price: 1.1,
          reason: "TAKE_PROFIT",
          t: reportDay,
        },
      }),
      createTestPosition({
        account: "beta",
        entryTime: reportDay,
        netPct: -0.5,
        netUsdt: -2,
        closed: {
          feeUsdt: 0,
          price: 0.9,
          reason: "STOP_LOSS",
          t: reportDay + 60_000,
        },
      }),
      createTestPosition({
        account: "disabled",
        entryTime: reportDay,
        netPct: 9,
        netUsdt: 90,
        closed: {
          feeUsdt: 0,
          price: 2,
          reason: "TAKE_PROFIT",
          t: reportDay + 120_000,
        },
      }),
    ]);
    const balanceSpy = vi
      .spyOn(slowTrading.storage.balanceSnapshots, "readCombined")
      .mockResolvedValue([
        {
          day: "2026-06-08",
          timestamp: Date.UTC(2026, 5, 8, 23, 55),
          total: 100,
        },
        {
          day: "2026-06-09",
          timestamp: Date.UTC(2026, 5, 9, 23, 55),
          total: 105,
        },
      ]);
    const centralSpy = vi
      .spyOn(trading.notif, "central")
      .mockResolvedValue(undefined);

    await slowTrading.notifications.dailyPerformance.notify({
      accounts: [
        { modeState: alphaState, slug: "alpha" },
        { modeState: betaState, slug: "beta" },
      ],
      currentTimeMs: Date.UTC(2026, 5, 10, 1),
      exchangeType: "binance",
      mode: "live",
      notification,
    });

    expect(balanceSpy).toHaveBeenCalledWith({
      accounts: ["alpha", "beta"],
      mode: "live",
    });
    expect(centralSpy).toHaveBeenCalledTimes(1);
    expect(centralSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title:
          "[DAILY] 9 Jun UTC | +$5.00 | +$7.00 -$2.00 | WR 50% (1W / 1L)",
        message: expect.stringContaining(
          "Accounts: alpha, beta\nTrade PnL: +$5.00\nTrade PnL %: +0.50%\nTrades: 2",
        ),
      }),
    );
    expect(alphaState.dailyPerformanceNotificationState?.telegram).toBe(
      "2026-06-09",
    );
    expect(betaState.dailyPerformanceNotificationState?.telegram).toBe(
      "2026-06-09",
    );
  });

  it("notifies once per daily PnL stop breach and resets after recovery", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const trading = (await import("@/lib/trading")).default;
    const storage = slowTrading.storage.data.createDefault();
    const modeState = storage.modes.sandbox;
    const centralSpy = vi
      .spyOn(trading.notif, "central")
      .mockResolvedValue(undefined);
    const baseParams = {
      currentTimeMs: Date.UTC(2026, 7, 31, 12),
      exchangeType: storage.config.exchangeType,
      mode: "sandbox" as const,
      modeState,
      notification: storage.runtime.notification,
    };

    // PROD:NOTIF_DAILY_PNL_LIMIT
    await slowTrading.notifications.dailyPnlLimit.notify({
      ...baseParams,
      evaluation: {
        day: "2026-08-31",
        pnlUsdt: -51.25,
        reached: true,
        thresholdUsdt: -50,
      },
    });
    await slowTrading.notifications.dailyPnlLimit.notify({
      ...baseParams,
      evaluation: {
        day: "2026-08-31",
        pnlUsdt: -55,
        reached: true,
        thresholdUsdt: -50,
      },
    });

    expect(centralSpy).toHaveBeenCalledTimes(1);
    expect(centralSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        key: "NOTIF_DAILY_PNL_LIMIT",
        title: "[SANDBOX] [DAILY PNL ENTRY STOP] -$51.25",
        message: expect.stringContaining(
          "Navbar USD PnL: -$51.25\nAuto-entry stop: -$50.00\nAutomatic entry: PAUSED",
        ),
      }),
    );

    await slowTrading.notifications.dailyPnlLimit.notify({
      ...baseParams,
      evaluation: {
        day: "2026-08-31",
        pnlUsdt: -45,
        reached: false,
        thresholdUsdt: -50,
      },
    });
    await slowTrading.notifications.dailyPnlLimit.notify({
      ...baseParams,
      evaluation: {
        day: "2026-08-31",
        pnlUsdt: -52,
        reached: true,
        thresholdUsdt: -50,
      },
    });

    expect(centralSpy).toHaveBeenCalledTimes(2);

    await slowTrading.storage.mode.saveState("sandbox", modeState);
    const reloaded = await slowTrading.storage.data.load();
    expect(
      reloaded.modes.sandbox.dailyPnlLimitNotificationState?.telegram,
    ).toEqual({ b: true, d: "2026-08-31" });
  });

});
