import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPosition } from "../fixtures/position";

let tmpRoot: string | null = null;

describe("slow specs storage", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-spec-storage-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.doUnmock("@/lib/datasets/fetchKlines");
    vi.doUnmock("@/components/storage");
    vi.resetModules();
  });

  it("uses the slow storage folder as the source-of-truth root", async () => {
    const { FILES } = await import("@/components/storage");
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    const storage = slowTradingStorage.data.createDefault();
    storage.runtime.sandboxEnabled = true;
    await slowTradingStorage.data.save(storage);
    const loaded = await slowTradingStorage.data.load();

    // PROD:STORAGE_SOURCE_OF_TRUTH
    expect(FILES.slow.root).toBe(path.join(tmpRoot!, "slow"));
    expect(await fs.pathExists(path.join(tmpRoot!, "slow/config.json"))).toBe(true);
    expect(await fs.pathExists(path.join(tmpRoot!, "slow/memory.json"))).toBe(true);
    expect(loaded.runtime.sandboxEnabled).toBe(true);
    expect(loaded.runtime.autoEntryDailyPnlLimitUSDT).toBe(-50);
    expect(
      loaded.runtime.notification.telegram.types.some(
        (item) => item.id === "NOTIF_DAILY_PNL_LIMIT",
      ),
    ).toBe(true);
    expect(loaded.runtime.pnlHistoryBucketMinutes).toBe(60);
    expect(loaded.runtime.blackSwanStageIntervalMinutes).toBe(1);
    expect(loaded.config.blackSwan?.enabled).toBe(false);
    expect(loaded.runtime.speedupStageIntervalMinutes).toBe(1);
    expect(loaded.runtime.speedupStagePositivePnlThresholdPct).toBe(1.5);
    expect(loaded.runtime.speedupStageNegativePnlThresholdPct).toBe(1.5);
    expect(loaded.runtime.speedupStageTakeProfitOffsetPct).toBe(0.5);
    expect(loaded.runtime.standardMonitoringStageIntervalMinutes).toBe(5);
    expect(loaded.runtime.managementStageIntervalMinutes).toBe(5);
    expect(loaded.runtime.captureEntryStageIntervalMinutes).toBe(5);
    expect(loaded.runtime.autoRemoveSymbolMinMarketCapUSD).toBe(0);
    expect(loaded.runtime.autoRemoveSymbolMinVPointPct).toBe(15);
    expect(loaded.config.maxOpenPositions).toBe(0);
    expect(loaded.config.modelConfig.exitOnVPointAbsLevel).toBe(0);
    expect(loaded.config.modelConfig.stopLossUSDT).toBe(50);
    expect(loaded.modes.live.stageRuns).toEqual({});
  });

  it("loads an existing account file without rewriting it", async () => {
    const { FILES } = await import("@/components/storage");
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;
    const accounts = slowTradingStorage.data.createDefault().runtime
      .exchangeAccounts;

    await fs.outputJSON(FILES.slow.accounts, {
      accounts,
      updatedAt: 123,
    });

    const loaded = await slowTradingStorage.account.loadAccounts();
    const persisted = await fs.readJSON(FILES.slow.accounts);

    // PROD:ATOMIC_PERSISTENT_JSON
    expect(loaded).toEqual(accounts);
    expect(persisted.updatedAt).toBe(123);
  });

  it("enables the daily PnL notification when migrating a pre-feature config", async () => {
    const { FILES } = await import("@/components/storage");
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;
    await slowTradingStorage.data.save(
      slowTradingStorage.data.createDefault(),
    );
    const configFile = await fs.readJSON(FILES.slow.config);

    delete configFile.runtime.autoEntryDailyPnlLimitUSDT;
    for (const channel of ["telegram", "email"]) {
      configFile.runtime.notification[channel].types =
        configFile.runtime.notification[channel].types.filter(
          (item: { id: string }) => item.id !== "NOTIF_DAILY_PNL_LIMIT",
        );
    }
    await fs.writeJSON(FILES.slow.config, configFile);

    const runtime = (await slowTradingStorage.data.load()).runtime;
    expect(runtime.autoEntryDailyPnlLimitUSDT).toBe(-50);
    expect(
      runtime.notification.telegram.types.some(
        (item) => item.id === "NOTIF_DAILY_PNL_LIMIT",
      ),
    ).toBe(true);
    expect(
      runtime.notification.email.types.some(
        (item) => item.id === "NOTIF_DAILY_PNL_LIMIT",
      ),
    ).toBe(true);
  });

  it("keeps the previous JSON intact when an atomic replacement fails", async () => {
    const slowTradingJsonFile = (
      await import("@/lib/slowTrading/storage/json-file")
    ).default;
    const filePath = path.join(tmpRoot!, "slow/atomic.json");

    await slowTradingJsonFile.write.atomic(filePath, { value: "stable" });
    await expect(
      slowTradingJsonFile.write.atomic(filePath, { value: BigInt(1) }),
    ).rejects.toThrow();

    // PROD:ATOMIC_PERSISTENT_JSON
    expect(await fs.readJSON(filePath)).toEqual({ value: "stable" });
    expect(
      (await fs.readdir(path.dirname(filePath))).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("normalizes all persisted production stage intervals", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    await slowTradingStorage.data.update({
      blackSwanStageIntervalMinutes: 0,
      speedupStageIntervalMinutes: 2.9,
      speedupStagePositivePnlThresholdPct: -2,
      speedupStageNegativePnlThresholdPct: -3,
      speedupStageTakeProfitOffsetPct: -0.5,
      standardMonitoringStageIntervalMinutes: 0,
      managementStageIntervalMinutes: 9.8,
      captureEntryStageIntervalMinutes: -3,
    });
    const runtime = (await slowTradingStorage.data.load()).runtime;

    // PROD:BLACK_SWAN_RISK_SENTINEL
    expect(runtime.blackSwanStageIntervalMinutes).toBe(1);

    // PROD:SPEEDUP_STAGE
    expect(runtime.speedupStageIntervalMinutes).toBe(2);
    expect(runtime.speedupStagePositivePnlThresholdPct).toBe(0);
    expect(runtime.speedupStageNegativePnlThresholdPct).toBe(0);
    expect(runtime.speedupStageTakeProfitOffsetPct).toBe(0);
    // PROD:STANDARD_MONITORING_STAGE
    expect(runtime.standardMonitoringStageIntervalMinutes).toBe(1);
    // PROD:MANAGEMENT_STAGE
    expect(runtime.managementStageIntervalMinutes).toBe(9);
    // PROD:CAPTURE_ENTRY_STAGE
    expect(runtime.captureEntryStageIntervalMinutes).toBe(1);
  });

  it("normalizes the persisted PnL history bucket in minutes", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    await slowTradingStorage.data.update({
      pnlHistoryBucketMinutes: 15.8,
    });
    expect(
      (await slowTradingStorage.data.load()).runtime
        .pnlHistoryBucketMinutes,
    ).toBe(15);

    await slowTradingStorage.data.update({
      pnlHistoryBucketMinutes: 0,
    });

    // PROD:MONITORING_OPEN_POSITION
    expect(
      (await slowTradingStorage.data.load()).runtime
        .pnlHistoryBucketMinutes,
    ).toBe(1);
  });

  it("normalizes the daily PnL entry stop and preserves a disabled notification type", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    await slowTradingStorage.data.update({
      autoEntryDailyPnlLimitUSDT: -75.5,
    });
    expect(
      (await slowTradingStorage.data.load()).runtime
        .autoEntryDailyPnlLimitUSDT,
    ).toBe(-75.5);

    const storage = await slowTradingStorage.data.load();
    storage.runtime.notification.telegram.types =
      storage.runtime.notification.telegram.types.filter(
        (item) => item.id !== "NOTIF_DAILY_PNL_LIMIT",
      );
    await slowTradingStorage.data.update({
      autoEntryDailyPnlLimitUSDT: 25,
      notification: storage.runtime.notification,
    });
    const reloaded = await slowTradingStorage.data.load();

    // PROD:AUTO_ENTRY_DAILY_PNL_LIMIT_USDT
    expect(reloaded.runtime.autoEntryDailyPnlLimitUSDT).toBe(0);
    expect(
      reloaded.runtime.notification.telegram.types.some(
        (item) => item.id === "NOTIF_DAILY_PNL_LIMIT",
      ),
    ).toBe(false);
  });

  it("normalizes the persisted maximum-open-position guard", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    await slowTradingStorage.data.update({
      config: {
        maxOpenPositions: 3.8,
      },
    });
    expect((await slowTradingStorage.data.load()).config.maxOpenPositions).toBe(
      3,
    );

    await slowTradingStorage.data.update({
      config: {
        maxOpenPositions: -2,
      },
    });

    // BOTH:MAX_OPEN_POSITIONS_ENTRY_GUARD
    expect((await slowTradingStorage.data.load()).config.maxOpenPositions).toBe(
      0,
    );
  });

  it("normalizes the persisted minimum market-cap removal threshold", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    await slowTradingStorage.data.update({
      autoRemoveSymbolMinMarketCapUSD: 100_000_000.5,
    });
    expect(
      (await slowTradingStorage.data.load()).runtime
        .autoRemoveSymbolMinMarketCapUSD,
    ).toBe(100_000_000.5);

    await slowTradingStorage.data.update({
      autoRemoveSymbolMinMarketCapUSD: -1,
    });

    // PROD:AUTO_REMOVE_COIN_BELOW_MIN_MARKET_CAP
    expect(
      (await slowTradingStorage.data.load()).runtime
        .autoRemoveSymbolMinMarketCapUSD,
    ).toBe(0);
  });

  it("defaults and normalizes the stored-vPoint percent removal threshold", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    expect(
      slowTradingStorage.data.createDefault().runtime
        .autoRemoveSymbolMinVPointPct,
    ).toBe(15);

    await slowTradingStorage.data.update({
      autoRemoveSymbolMinVPointPct: 17.5,
    });
    expect(
      (await slowTradingStorage.data.load()).runtime
        .autoRemoveSymbolMinVPointPct,
    ).toBe(17.5);

    await slowTradingStorage.data.update({
      autoRemoveSymbolMinVPointPct: -1,
    });
    expect(
      (await slowTradingStorage.data.load()).runtime
        .autoRemoveSymbolMinVPointPct,
    ).toBe(0);
  });

  it("keeps closed history out of default runtime loads unless requested", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.modes.live = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.live,
      storage.config.symbols,
    );
    storage.modes.live.tradeSettings[0].model_memory.positionsSell = [
      createTestPosition({
        executionMode: "live",
        entryTime: Date.UTC(2026, 5, 1),
        entryPrice: 1,
        notionalUsdt: 10,
        quantity: 10,
        symbol: "SUI",
        closed: {
          t: Date.UTC(2026, 5, 2),
          price: 1.1,
          feeUsdt: 0,
          reason: "TAKE_PROFIT",
        },
      }),
    ];

    await slowTradingStorage.data.save(storage);
    await slowTradingStorage.mode.saveState("live", storage.modes.live);

    const lean = await slowTradingStorage.data.load();
    const withHistory = await slowTradingStorage.data.load({
      includeHistory: true,
    });

    // PROD:SLOW_RUNTIME_MEMORY_LEAN
    expect(lean.modes.live.tradeSettings[0].model_memory.positionsSell ?? [])
      .toHaveLength(0);
    expect(
      withHistory.modes.live.tradeSettings[0].model_memory.positionsSell ?? [],
    ).toHaveLength(1);
  });

  it("loads persisted history independently from configured symbols", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI", "ZRO"];
    storage.modes.live = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.live,
      storage.config.symbols,
    );
    const zro = storage.modes.live.tradeSettings.find(
      (item) => item.symbol === "ZRO",
    )!;
    zro.model_memory.positionsSell = [
      createTestPosition({
        entryId: "zro-entry",
        executionMode: "live",
        entryTime: Date.UTC(2026, 5, 1),
        entryPrice: 1,
        notionalUsdt: 10,
        quantity: 10,
        symbol: "ZRO",
        closed: {
          t: Date.UTC(2026, 5, 2),
          price: 1.1,
          feeUsdt: 0,
          reason: "TAKE_PROFIT",
        },
      }),
    ];

    await slowTradingStorage.data.save(storage);
    await slowTradingStorage.mode.saveState("live", storage.modes.live);
    await slowTradingStorage.data.update({ symbols: ["SUI"] });

    const lean = await slowTradingStorage.data.load();
    const withHistory = await slowTradingStorage.data.load({
      includeHistory: true,
    });
    const history = slowTradingStorage.history.getClosed(withHistory, "live");
    const dashboard = slowTradingStorage.dashboard.buildState(withHistory);

    expect(lean.config.symbols).toEqual(["SUI"]);
    expect(
      lean.modes.live.tradeSettings.some((item) => item.symbol === "ZRO"),
    ).toBe(false);

    // PROD:HISTORY_CONFIG_INDEPENDENT
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      opened: { vPoint: { id: "zro-entry" } },
      symbol: "ZRO",
    });
    expect(dashboard.history).toContainEqual(
      expect.objectContaining({
        opened: expect.objectContaining({
          vPoint: expect.objectContaining({ id: "zro-entry" }),
        }),
        symbol: "ZRO",
      }),
    );
  });

  it("updates and clears notes in only the matching persisted history position", async () => {
    const { FILES } = await import("@/components/storage");
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;
    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    storage.modes.sandbox.tradeSettings[0].model_memory.positionsSell = [
      createTestPosition({
        entryId: "note-entry",
        entryTime: Date.UTC(2026, 6, 1),
        symbol: "SUI",
        closed: {
          t: Date.UTC(2026, 6, 2),
          price: 11,
          feeUsdt: 0,
          reason: "TAKE_PROFIT",
        },
      }),
    ];

    await slowTradingStorage.data.save(storage);
    await slowTradingStorage.mode.saveState("sandbox", storage.modes.sandbox);

    const identity = {
      entryId: "note-entry",
      entryTime: Date.UTC(2026, 6, 1),
      exitTime: Date.UTC(2026, 6, 2),
      mode: "sandbox" as const,
      quantity: 1,
      symbol: "SUI",
      usdt: 10,
    };

    // PROD:TRADE_HISTORY_NOTES
    expect(
      await slowTradingStorage.history.updateNotes({
        ...identity,
        notes: "  Follow breakout retest  ",
      }),
    ).toMatchObject({ updated: true });

    const historyFile = path.join(FILES.slow.sandbox.historyRoot, "SUI.json");
    expect(await fs.readJSON(historyFile)).toEqual([
      expect.objectContaining({ notes: "Follow breakout retest" }),
    ]);

    await slowTradingStorage.history.updateNotes({
      ...identity,
      notes: "   ",
    });
    expect(await fs.readJSON(historyFile)).toEqual([
      expect.not.objectContaining({ notes: expect.anything() }),
    ]);
  });

  it("loads only the active mode for runtime paths and preserves inactive mode on save", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["INJ", "MOVR"];
    storage.runtime.sandboxEnabled = false;
    storage.modes.live = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.live,
      storage.config.symbols,
    );
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    storage.modes.live.tradeSettings[0].model_memory.positions = [
      createTestPosition({
        executionMode: "live",
        entryTime: 1,
        entryPrice: 10,
        quantity: 1,
        notionalUsdt: 10,
        symbol: "INJ",
      }),
    ];
    storage.modes.sandbox.tradeSettings[1].model_memory.positions = [
      createTestPosition({
        entryTime: 2,
        entryPrice: 20,
        quantity: 1,
        notionalUsdt: 20,
        symbol: "MOVR",
      }),
    ];

    await slowTradingStorage.data.save(storage);

    const activeOnly = await slowTradingStorage.data.load({
      modeScope: "active",
    });
    activeOnly.modes.live.dynamicTradeMemory.quoteAsset = 123;
    await slowTradingStorage.mode.saveState("live", activeOnly.modes.live);

    const full = await slowTradingStorage.data.load();

    // PROD:SLOW_RUNTIME_MEMORY_LEAN
    expect(activeOnly.modes.live.tradeSettings).toHaveLength(2);
    expect(activeOnly.modes.sandbox.tradeSettings).toHaveLength(0);
    expect(full.modes.live.dynamicTradeMemory.quoteAsset).toBe(123);
    expect(full.modes.sandbox.tradeSettings[1].model_memory.positions)
      .toHaveLength(1);
  });

  it("resets sandbox using the requested initial balance override", async () => {
    const slowTradingStorage = (await import("@/lib/slowTrading")).default
      .storage;

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["INJ"];
    storage.runtime.sandboxEnabled = true;
    storage.runtime.sandboxInitialBalanceUSDT = 1_000;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    storage.modes.sandbox.dynamicTradeMemory.quoteAsset = 777;
    storage.modes.sandbox.tradeSettings[0].model_memory.positions = [
      { entryTime: 1, entryPrice: 10, quantity: 1, usdt: 10 } as any,
    ];
    await slowTradingStorage.data.save(storage);

    const reset = await slowTradingStorage.data.resetSandbox({
      sandboxInitialBalanceUSDT: 180,
    });

    expect(reset.runtime.sandboxInitialBalanceUSDT).toBe(180);
    expect(reset.modes.sandbox.dynamicTradeMemory.startingBalanceUSDT).toBe(180);
    expect(reset.modes.sandbox.dynamicTradeMemory.quoteAsset).toBe(180);
    expect(reset.modes.sandbox.tradeSettings[0].model_memory.positions)
      .toHaveLength(0);
  });

  it("serves dashboard volatility points from the same persisted array", async () => {
    const klines = [
      [1_000, "9", "10", "8", "9", "10", 0, "90"],
      [2_000, "9", "10", "8", "9", "10", 0, "90"],
      [3_000, "9", "10", "8", "9", "10", 0, "90"],
    ];
    const getStoredVolatilityPoints = vi.fn(async () => [
      {
        id: "T_outside_01_01_26_00_00",
        l: "T",
        lvl: 1,
        pct: 5,
        p: 8,
        t: 500,
        timeHuman: "01-01-2026 00:00",
        vb: 1,
        vq: 8,
      },
      {
        id: "T_stored_01_01_26_00_05",
        l: "T",
        lvl: 2,
        pct: 5.98,
        p: 75.97,
        symbol: "SOL",
        t: 2_000,
        timeHuman: "01-01-2026 00:05",
        used: true,
        vb: 1,
        vq: 75.97,
      },
    ]);
    const fetchKlines = vi.fn(async () => klines);

    vi.doMock("@/lib/datasets/fetchKlines", () => ({
      fetchKlinesFunction: fetchKlines,
    }));

    vi.doMock("@/components/storage", () => ({
      FILES: {
        slow: {
          volatilityPoints: {
            get: getStoredVolatilityPoints,
          },
        },
      },
    }));

    const { getKlines } = await import("@/pages/api/dashboard/klines");
    const json = vi.fn();

    await getKlines(
      {
        method: "GET",
        query: {
          exchange: "binance",
          interval: "5m",
          marketType: "FUTURES",
          symbol: "SOL",
          upToDateKlines: true,
          volatility: true,
          volatilitySource: "storage",
        },
      } as any,
      { json } as any,
    );

    const response = json.mock.calls[0][0];

    // PROD:SAME_VOLATILITY_POINT
    expect(getStoredVolatilityPoints).toHaveBeenCalledWith("binance", "SOL");
    expect(fetchKlines).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeType: "binance",
        marketType: "FUTURES",
      }),
    );
    expect(response.markers).toHaveLength(1);
    expect(response.markers[0].text).toBe("TOP[2] 5.98 - stored");
    expect(response.vPointsSeries.series[0][0].text).toContain("T - stored");
    expect(response.vPointsSeries.series[0][0].level).toBe(2);
  });

  it("exports and imports full persistent storage with a local backup", async () => {
    const onlineRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-spec-online-"));
    const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-spec-local-"));

    try {
      const slowTrading = (await import("@/lib/slowTrading")).default;

      await fs.outputJSON(path.join(onlineRoot, "slow/config.json"), {
        source: "online",
      });
      await fs.outputFile(
        path.join(onlineRoot, "slow/binance/volatility/SUI.json"),
        JSON.stringify({ lastVolatility: [{ id: "online-vpoint" }] }),
      );
      await fs.outputJSON(path.join(localRoot, "slow/config.json"), {
        source: "local",
      });

      const bundle =
        await slowTrading.debugSync.exportPersistentStorageBundle(onlineRoot);
      const result =
        await slowTrading.debugSync.importPersistentStorageBundle(
          bundle,
          localRoot,
        );

      // PROD:SYNC_ONLINE_TO_LOCAL
      expect(await fs.readJSON(path.join(localRoot, "slow/config.json"))).toEqual({
        source: "online",
      });
      expect(
        await fs.readJSON(path.join(localRoot, "slow/binance/volatility/SUI.json")),
      ).toEqual({ lastVolatility: [{ id: "online-vpoint" }] });
      expect(result.backupPath).toBeTruthy();
      expect(
        await fs.readJSON(path.join(result.backupPath!, "slow/config.json")),
      ).toEqual({ source: "local" });
    } finally {
      await fs.remove(onlineRoot);
      await fs.remove(localRoot);
      await fs.remove(`${localRoot}-sync-backups`);
    }
  });

  it("shows manual coin metadata sync only for APP_NAME localhost on localhost", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const isAllowed =
      slowTrading.debugSync.isLocalCoinMetadataManualSyncAllowed;

    process.env.APP_NAME = "localhost";
    // PROD:COIN_METADATA_SYNC
    expect(isAllowed("localhost:3010")).toBe(true);
    expect(isAllowed("wealth.reinventwp.com")).toBe(false);

    process.env.APP_NAME = "wealth.reinventwp.com";
    expect(isAllowed("localhost:3010")).toBe(false);

    delete process.env.APP_NAME;
  });
});
