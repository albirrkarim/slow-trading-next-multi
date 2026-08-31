import type { TradingModelMemory } from "@/lib/trading/models";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPosition } from "../../fixtures/position";

const exchangeMocks = vi.hoisted(() => ({
  getBalance: vi.fn(),
  getKlines: vi.fn(),
  getPositions: vi.fn(),
  getTotalFeePercent: vi.fn(),
}));

const dynamicMocks = vi.hoisted(() => ({
  generateInitialPriceNorm: vi.fn(),
}));

vi.mock("@/lib/exchange/adapters/binance", () => ({
  BinanceAdapter: class {
    getBalance = exchangeMocks.getBalance;
    getKlines = exchangeMocks.getKlines;
    getPositions = exchangeMocks.getPositions;

    getFees() {
      return {
        getBothSideFeePercent: vi.fn(() => 0),
        getTotalFeePercent: exchangeMocks.getTotalFeePercent,
      };
    }
  },
}));

vi.mock("@/components/api/production/utils", async () => {
  const actual = await vi.importActual<any>("@/components/api/production/utils");

  return {
    ...actual,
    assignVolatility: vi.fn(async (modelMemoryMap: Record<string, any>) => {
      for (const symbol of Object.keys(modelMemoryMap)) {
        modelMemoryMap[symbol].volatility = {
          lastVolatility: [],
          symbol,
        };
      }
    }),
  };
});

vi.mock("@/lib/dynamic", async () => {
  const actual = await vi.importActual<any>("@/lib/dynamic");

  return {
    ...actual,
    default: {
      ...actual.default,
      priceNorm: {
        ...actual.default.priceNorm,
        generateInitial: dynamicMocks.generateInitialPriceNorm,
      },
    },
  };
});

let tmpRoot: string | null = null;

function kline(t: number, price: number) {
  return [t, `${price}`, `${price}`, `${price}`, `${price}`, "1"] as any;
}

function openModelMemory(): TradingModelMemory {
  return {
    positions: [
      createTestPosition({
        direction: "LONG",
        entryPrice: 100,
        entryTime: Date.UTC(2026, 0, 1),
        executionMode: "live",
        marginUsdt: 10,
        notionalUsdt: 10,
        quantity: 0.1,
        symbol: "SUI",
      }),
    ],
    positionsSell: [],
  };
}

async function saveStorage(params: {
  autoEntryEnabled?: boolean;
  autoEntryDailyPnlLimitUSDT?: number;
  autoExitEnabled?: boolean;
  dailyPnlUsdt?: number;
  enableWatchLogic?: boolean;
  openPosition?: boolean;
  runnerEnabled?: boolean;
  blackSwanStatus?: "WATCH" | "CRISIS" | "RECOVERY";
}) {
  const slowTrading = (await import("@/lib/slowTrading")).default;
  const { TradingMode } = await import("@/lib/exchange");
  const storage = slowTrading.storage.data.createDefault();

  storage.config.exchangeType = "binance";
  storage.config.tradingMode = TradingMode.SPOT;
  storage.config.symbols = ["SUI"];
  storage.config.enableWatchLogic = params.enableWatchLogic ?? false;
  storage.runtime.autoEntryEnabled = params.autoEntryEnabled ?? false;
  storage.runtime.autoEntryDailyPnlLimitUSDT =
    params.autoEntryDailyPnlLimitUSDT ?? -50;
  storage.runtime.autoExitEnabled = params.autoExitEnabled ?? false;
  storage.runtime.runnerEnabled = params.runnerEnabled ?? true;
  storage.runtime.sandboxEnabled = false;
  storage.modes.live = slowTrading.storage.mode.ensureTradeSettings(
    storage.modes.live,
    storage.config.symbols,
  );
  storage.modes.live.dynamicTradeMemory.quoteAsset = 1_000;
  storage.modes.live.dynamicTradeMemory.safeHaven = 0;

  if (params.blackSwanStatus) {
    storage.modes.live.blackSwan = {
      status: params.blackSwanStatus,
      reason: "BTC_WARNING",
      since: Date.now(),
      t: Date.now(),
    };
  }

  if (params.openPosition) {
    storage.modes.live.tradeSettings[0].model_memory = openModelMemory();
  }

  if (params.dailyPnlUsdt !== undefined) {
    storage.runtime.notification.telegram.enabled = false;
    storage.runtime.notification.email.enabled = false;
    storage.modes.live.tradeSettings[0].model_memory.positionsSell = [
      createTestPosition({
        entryTime: Date.now() - 120_000,
        netUsdt: params.dailyPnlUsdt,
        symbol: "SUI",
        closed: {
          feeUsdt: 0,
          price: 100,
          reason: "STOP_LOSS",
          t: Date.now() - 60_000,
        },
      }),
    ];
  }

  await slowTrading.storage.data.save(storage);
  if (params.dailyPnlUsdt !== undefined) {
    await slowTrading.storage.mode.saveState("live", storage.modes.live);
  }

  return { slowTrading, storage };
}

describe("settings behavior: runtime cycle toggles", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-settings-runtime-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.clearAllMocks();

    exchangeMocks.getBalance.mockResolvedValue({
      baseAsset: 0,
      quoteAsset: 1_000,
    });
    exchangeMocks.getKlines.mockResolvedValue([
      kline(Date.UTC(2026, 0, 1), 100),
      kline(Date.UTC(2026, 0, 1, 0, 5), 100),
    ]);
    exchangeMocks.getPositions.mockResolvedValue([]);
    exchangeMocks.getTotalFeePercent.mockReturnValue(0);
    dynamicMocks.generateInitialPriceNorm.mockImplementation(
      async ({ dynamicTradeMemory }: any) => {
        dynamicTradeMemory.priceNormMapOverTime = {};
      },
    );
  });

  afterEach(async () => {
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses runnerEnabled to skip the cycle unless explicitly ignored", async () => {
    const { slowTrading } = await saveStorage({
      runnerEnabled: false,
    });
    const buildSignals = vi.spyOn(slowTrading.signals, "build");

    const result = await slowTrading.service.runSlowTradingCycle();

    expect(result.skipped).toBe(true);
    expect(buildSignals).not.toHaveBeenCalled();
  });

  it("uses autoEntryEnabled to call or skip signal generation", async () => {
    const disabled = await saveStorage({
      autoEntryEnabled: false,
      runnerEnabled: true,
    });
    const disabledBuild = vi.spyOn(disabled.slowTrading.signals, "build");

    await disabled.slowTrading.service.runSlowTradingCycle();

    expect(disabledBuild).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.resetModules();
    const enabled = await saveStorage({
      autoEntryEnabled: true,
      runnerEnabled: true,
    });
    const enabledBuild = vi
      .spyOn(enabled.slowTrading.signals, "build")
      .mockResolvedValue({
        activeMode: "live",
        entrySignals: [],
        modelMemoryMap: {
          SUI: {
            positions: [],
            volatility: { lastVolatility: [], symbol: "SUI" },
          },
        },
        storage: enabled.storage,
        symbols: ["SUI"],
        tradeSettings: enabled.storage.modes.live.tradeSettings,
      } as any);

    await enabled.slowTrading.service.runSlowTradingCycle();

    expect(enabledBuild).toHaveBeenCalledOnce();
  });

  it("stops automatic entry at the daily navbar PnL limit but allows manual entry", async () => {
    const { slowTrading } = await saveStorage({
      autoEntryDailyPnlLimitUSDT: -50,
      autoEntryEnabled: true,
      dailyPnlUsdt: -55,
      runnerEnabled: true,
    });
    const buildSignals = vi.spyOn(slowTrading.signals, "build");

    // PROD:AUTO_ENTRY_DAILY_PNL_LIMIT_USDT
    await slowTrading.service.runSlowTradingCycle({
      stage: "capture-entry",
    });
    expect(buildSignals).not.toHaveBeenCalled();
    expect(
      (await slowTrading.storage.data.load()).modes.live.dailyPnlLimitState,
    ).toEqual({
      d: new Date().toISOString().slice(0, 10),
      usdt: -55,
    });

    await slowTrading.service.runSlowTradingCycle({
      forceEntrySymbols: ["SUI"],
    });
    expect(buildSignals).toHaveBeenCalledOnce();
  });

  it("keeps entry capture separate from open-position monitoring", async () => {
    const { slowTrading } = await saveStorage({
      autoEntryEnabled: true,
      autoExitEnabled: true,
      openPosition: true,
      runnerEnabled: true,
    });
    const trading = (await import("@/lib/trading")).default;
    const buildSignals = vi.spyOn(slowTrading.signals, "build");
    const exit = vi.spyOn(trading.execution, "exit");

    const captureResult = await slowTrading.service.runSlowTradingCycle({
      stage: "capture-entry",
    });

    // PROD:CAPTURE_ENTRY_STAGE
    expect(captureResult.symbols).toEqual([]);
    expect(buildSignals).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    const afterEmptyCapture = await slowTrading.storage.data.load({
      modeScope: "active",
    });
    const captureRun = afterEmptyCapture.modes.live.stageRuns?.["capture-entry"];

    // PROD:STAGE_RUN_STATS
    expect(captureRun).toMatchObject({ reports: 0, symbols: 0 });
    expect(captureRun?.t).toEqual(expect.any(Number));
    expect(captureRun?.performance.sections.some(
      (section) => section.s === "storage.load",
    )).toBe(true);

    await slowTrading.service.runSlowTradingCycle({
      stage: "standard-monitoring",
    });

    // PROD:STANDARD_MONITORING_STAGE
    expect(buildSignals).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
    const afterMonitoring = await slowTrading.storage.data.load({
      modeScope: "active",
    });
    expect(afterMonitoring.modes.live.stageRuns?.["capture-entry"]).toEqual(
      captureRun,
    );
    expect(
      afterMonitoring.modes.live.stageRuns?.["standard-monitoring"],
    ).toMatchObject({ reports: 1, symbols: 1 });
  });

  it("uses autoExitEnabled to call or skip exit execution for open positions", async () => {
    const disabled = await saveStorage({
      autoExitEnabled: false,
      openPosition: true,
      runnerEnabled: true,
    });
    const tradingDisabled = (await import("@/lib/trading")).default;
    const disabledExit = vi.spyOn(tradingDisabled.execution, "exit");

    await disabled.slowTrading.service.runSlowTradingCycle();

    expect(disabledExit).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.resetModules();
    const enabled = await saveStorage({
      autoExitEnabled: true,
      openPosition: true,
      runnerEnabled: true,
    });
    const tradingEnabled = (await import("@/lib/trading")).default;
    const enabledExit = vi
      .spyOn(tradingEnabled.execution, "exit")
      .mockResolvedValue({ message: "exit checked" });

    await enabled.slowTrading.service.runSlowTradingCycle();

    expect(enabledExit).toHaveBeenCalledOnce();
  });

  it("uses enableWatchLogic to call or skip averaging recommendations", async () => {
    const disabled = await saveStorage({
      enableWatchLogic: false,
      openPosition: true,
      runnerEnabled: true,
    });
    const disabledAveraging = vi.spyOn(
      disabled.slowTrading.watchReserve.averaging,
      "generateRecommendations",
    );

    await disabled.slowTrading.service.runSlowTradingCycle();

    expect(disabledAveraging).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.resetModules();
    const enabled = await saveStorage({
      enableWatchLogic: true,
      openPosition: true,
      runnerEnabled: true,
    });
    const enabledAveraging = vi
      .spyOn(enabled.slowTrading.watchReserve.averaging, "generateRecommendations")
      .mockReturnValue({ recommendations: [] });

    await enabled.slowTrading.service.runSlowTradingCycle();

    expect(enabledAveraging).toHaveBeenCalledOnce();
  });

  it("evaluates exit before averaging during monitoring", async () => {
    const { slowTrading } = await saveStorage({
      autoExitEnabled: true,
      enableWatchLogic: true,
      openPosition: true,
      runnerEnabled: true,
    });
    const trading = (await import("@/lib/trading")).default;
    const exit = vi
      .spyOn(trading.execution, "exit")
      .mockResolvedValue({ message: "exit checked" });
    const averaging = vi
      .spyOn(slowTrading.watchReserve.averaging, "generateRecommendations")
      .mockReturnValue({ recommendations: [] });

    await slowTrading.service.runSlowTradingCycle({
      stage: "standard-monitoring",
    });

    expect(exit).toHaveBeenCalledOnce();
    expect(averaging).toHaveBeenCalledOnce();
    expect(exit.mock.invocationCallOrder[0]).toBeLessThan(
      averaging.mock.invocationCallOrder[0],
    );
  });

  it("blocks entry and averaging in protective states while allowing exits", async () => {
    const { slowTrading } = await saveStorage({
      autoEntryEnabled: true,
      autoExitEnabled: true,
      blackSwanStatus: "WATCH",
      enableWatchLogic: true,
      openPosition: true,
      runnerEnabled: true,
    });
    const trading = (await import("@/lib/trading")).default;
    const buildSignals = vi.spyOn(slowTrading.signals, "build");
    const exit = vi
      .spyOn(trading.execution, "exit")
      .mockResolvedValue({ message: "exit checked" });
    const averaging = vi.spyOn(
      slowTrading.watchReserve.averaging,
      "generateRecommendations",
    );

    // BOTH:BLACK_SWAN_ENTRY_GUARD
    // BOTH:BLACK_SWAN_AVERAGING_GUARD
    await slowTrading.service.runSlowTradingCycle({
      forceEntrySymbols: ["SUI"],
    });

    expect(buildSignals).not.toHaveBeenCalled();
    expect(averaging).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
    const loaded = await slowTrading.storage.data.load({ modeScope: "active" });
    expect(loaded.modes.live.tradeSettings[0].model_memory.justBuy).toBeUndefined();
  });

  it("keeps unconfigured open positions after a cycle so removed coins can still exit", async () => {
    const { slowTrading } = await saveStorage({
      autoExitEnabled: false,
      openPosition: true,
      runnerEnabled: true,
    });

    await slowTrading.storage.data.update({ symbols: ["AAVE"] });
    await slowTrading.service.runSlowTradingCycle();

    const loaded = await slowTrading.storage.data.load();
    const symbolsWithOpenPositions = loaded.modes.live.tradeSettings
      .filter((item) => (item.model_memory.positions?.length ?? 0) > 0)
      .map((item) => item.symbol);

    expect(loaded.config.symbols).toEqual(["AAVE"]);
    expect(symbolsWithOpenPositions).toEqual(["SUI"]);
  });
});
