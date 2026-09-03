import type { EntryRecommendation } from "@/lib/brain";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeMocks = vi.hoisted(() => ({
  adjustQuantity: vi.fn(),
  getBalance: vi.fn(),
  getKlines: vi.fn(),
  getPositions: vi.fn(),
  getTotalFeePercent: vi.fn(),
}));

const dynamicMocks = vi.hoisted(() => ({
  generateInitialPriceNorm: vi.fn(),
}));

const productionMocks = vi.hoisted(() => ({
  assignVolatility: vi.fn(),
}));

const brainMocks = vi.hoisted(() => ({
  getInvestmentAmount: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  central: vi.fn(),
}));

const marketCapMocks = vi.hoisted(() => ({
  getMap: vi.fn(),
}));

const e2eSignal: EntryRecommendation = {
  amountProbab: 1,
  id: "SUI_e2e_bottom",
  l: "B",
  lvl: -3,
  maxLeverage: 1,
  message: "e2e entry",
  pct: -3,
  p: 100,
  symbol: "SUI",
  t: Date.UTC(2026, 0, 1, 0, 0),
} as EntryRecommendation;

const productionLikeSymbols = [
  "SUI",
  "AAVE",
  "AGLD",
  "AIXBT",
  "AKT",
  "ALGO",
  "APT",
  "ARB",
  "ASTR",
  "ATOM",
  "AWE",
  "BEL",
  "BR",
  "CHZ",
  "COMP",
  "COW",
  "CVC",
  "DEXE",
  "DIA",
  "DYDX",
  "EGLD",
  "ENA",
  "ENS",
  "FIDA",
  "GRASS",
  "HBAR",
  "HYPER",
  "INJ",
  "IOTX",
  "JUP",
  "KAVA",
  "KNC",
  "LINK",
  "LISTA",
  "LUMIA",
  "MASK",
  "MOCA",
  "MOVE",
  "MOVR",
  "ONG",
  "ORCA",
  "PARTI",
  "PHA",
  "POL",
  "PUNDIX",
  "QNT",
  "RARE",
  "RED",
  "RLC",
  "RUNE",
  "SCR",
  "SCRT",
  "SFP",
  "SIGN",
  "SPK",
  "SPX",
  "STEEM",
  "STORJ",
  "T",
  "TAO",
  "TIA",
  "TRB",
  "TRUMP",
  "TWT",
  "USUAL",
  "VVV",
  "W",
  "WAL",
  "XAI",
  "XLM",
  "XRP",
  "YFI",
  "YGG",
  "ZK",
  "ZRO",
  "BTC",
  "ETH",
  "SOL",
  "DOGE",
  "BNB",
];

vi.mock("@/lib/exchange/adapters/binance", () => ({
  BinanceAdapter: class {
    adjustQuantity = exchangeMocks.adjustQuantity;
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
  const actual = await vi.importActual<any>(
    "@/components/api/production/utils",
  );

  return {
    ...actual,
    assignVolatility: productionMocks.assignVolatility.mockImplementation(
      async (modelMemoryMap: Record<string, any>) => {
        for (const symbol of Object.keys(modelMemoryMap)) {
          modelMemoryMap[symbol].volatility = {
            lastVolatility: symbol === "SUI" ? [{ ...e2eSignal }] : [],
            symbol,
          };
        }
      },
    ),
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

vi.mock("@/lib/brain", async () => {
  const actual = await vi.importActual<any>("@/lib/brain");

  return {
    ...actual,
    default: {
      ...actual.default,
      algorithms: {
        ...actual.default.algorithms,
        runtime: {
          ...actual.default.algorithms.runtime,
          getInvestmentAmount: brainMocks.getInvestmentAmount,
        },
      },
    },
  };
});

vi.mock("@/lib/notification", async () => {
  const actual = await vi.importActual<any>("@/lib/notification");

  return {
    ...actual,
    notif: {
      central: notificationMocks.central,
    },
  };
});

vi.mock("@/lib/exchange/market-cap", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  getMarketCapUSDMapForSymbols: marketCapMocks.getMap,
}));

let tmpRoot: string | null = null;

function createKline(t: number, p: number) {
  return [t, `${p}`, `${p}`, `${p}`, `${p}`, "100"] as any;
}

describe("slow end-to-end cycle", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-e2e-cycle-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.clearAllMocks();

    exchangeMocks.adjustQuantity.mockImplementation(async (quantity: number) =>
      Number(quantity.toFixed(6)),
    );
    exchangeMocks.getBalance.mockResolvedValue({
      baseAsset: 0,
      quoteAsset: 1_000,
    });
    exchangeMocks.getKlines.mockResolvedValue([
      createKline(Date.UTC(2026, 0, 1, 0, 0), 100),
      createKline(Date.UTC(2026, 0, 1, 0, 5), 100),
    ]);
    exchangeMocks.getPositions.mockResolvedValue([]);
    exchangeMocks.getTotalFeePercent.mockReturnValue(0);
    brainMocks.getInvestmentAmount.mockReturnValue(20);
    marketCapMocks.getMap.mockResolvedValue({});
    dynamicMocks.generateInitialPriceNorm.mockImplementation(
      async ({ dynamicTradeMemory }: any) => {
        dynamicTradeMemory.priceNormMapOverTime = {
          SUI: [{ t: Date.UTC(2026, 0, 1, 0, 5), value: 1 }],
        };
      },
    );
  });

  afterEach(async () => {
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.resetModules();
  });

  it("runs a persisted sandbox cycle and exposes the result through dashboard state", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.sandboxInitialBalanceUSDT = 1_000;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    await slowTradingStorage.data.save(storage);

    const result = await slowTrading.service.runSlowTradingCycle({
      forceEntrySymbols: ["SUI"],
    });
    const persisted = await slowTradingStorage.data.load({
      modeScope: "active",
    });
    const dashboard = slowTradingStorage.dashboard.buildState(persisted);

    // PROD:SLOW_END_TO_END_CYCLE
    expect(result.executedEntrySignals).toBe(1);
    expect(result.skippedEntrySignals).toEqual([]);
    expect(exchangeMocks.getKlines).toHaveBeenCalledWith(
      expect.objectContaining({
        marketType: "SPOT",
        symbol: "SUI_USDT",
      }),
    );
    expect(dynamicMocks.generateInitialPriceNorm).toHaveBeenCalled();
    expect(await fs.pathExists(path.join(tmpRoot!, "slow/config.json"))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(tmpRoot!, "slow/memory.json"))).toBe(
      true,
    );
    expect(
      await fs.pathExists(
        path.join(tmpRoot!, "slow/sandbox/balance_snapshots.json"),
      ),
    ).toBe(true);
    expect(dashboard.activeMode).toBe("sandbox");
    expect(dashboard.openPositions).toHaveLength(1);
    expect(dashboard.openPositions[0]).toMatchObject({
      executionMode: "sandbox",
      opened: { vPoint: { id: e2eSignal.id } },
      exposure: { averageEntryPrice: 100 },
      symbol: "SUI",
      tradingMode: TradingMode.SPOT,
    });
    expect(dashboard.balances.availableQuoteAsset).toBe(980);
    expect(dashboard.stats.lastRunSummary).toContain(
      "sandbox cycle finished with 1 report(s)",
    );
  });

  it("prepares shared market inputs once and executes both accounts", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");
    const storage = slowTradingStorage.data.createDefault();
    const template = storage.runtime.exchangeAccounts[0];

    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    await slowTradingStorage.data.save(storage);
    await slowTradingStorage.account.saveAccounts(
      [
        {
          ...template,
          slug: "alpha",
          name: "Alpha",
          sandbox: { enabled: true, initialBalanceUSDT: 1_000 },
        },
        {
          ...template,
          slug: "beta",
          name: "Beta",
          sandbox: { enabled: true, initialBalanceUSDT: 1_000 },
        },
      ],
      storage.sharedConfig,
    );

    const result = await slowTrading.service.runSlowTradingCycle({
      forceEntrySymbols: ["SUI"],
      stage: "capture-entry",
    });
    const alpha = await slowTradingStorage.data.load({ account: "alpha" });
    const beta = await slowTradingStorage.data.load({ account: "beta" });

    // PROD:MULTI_ACCOUNT_SHARED_MARKET_PREPARATION
    expect(productionMocks.assignVolatility).toHaveBeenCalledTimes(1);
    expect(dynamicMocks.generateInitialPriceNorm).toHaveBeenCalledTimes(1);
    // PROD:MULTI_ACCOUNT_SEQUENTIAL_ACCOUNT_EXECUTION
    // PROD:MULTI_ACCOUNT_PRIVATE_STATE_ISOLATION
    expect(result.executedEntrySignals).toBe(2);
    expect(
      alpha.modes.sandbox.tradeSettings[0].model_memory.positions,
    ).toHaveLength(1);
    expect(
      beta.modes.sandbox.tradeSettings[0].model_memory.positions,
    ).toHaveLength(1);
    expect(alpha.modes.sandbox.dynamicTradeMemory.quoteAsset).toBe(980);
    expect(beta.modes.sandbox.dynamicTradeMemory.quoteAsset).toBe(980);
  });

  it("classifies a persisted averaged position with shared volatility", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { createTestPosition } = await import("../fixtures/position");
    const storage = slowTradingStorage.data.createDefault();
    const position = createTestPosition({
      direction: "LONG",
      entryPrice: 100,
      entryTime: e2eSignal.t - 60_000,
      executionMode: "sandbox",
      pnl: {
        markPrice: 103,
        maxDownPct: 0,
        maxUpPct: 0,
        netPct: 0,
        netUsdt: 0,
      },
      symbol: "SUI",
    });
    position.strategy.averaging.executions = [
      {
        allocationPct: 3,
        level: -3,
        marginUsdt: 10,
        price: 100,
        t: e2eSignal.t,
      },
    ];

    storage.config.symbols = ["SUI"];
    storage.config.enableWatchLogic = false;
    storage.config.modelConfig.takeProfitPercent = 20;
    storage.config.modelConfig.useStopLossPlus = false;
    storage.runtime.autoEntryEnabled = false;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.speedupStageNegativePnlThresholdPct = 10;
    storage.runtime.speedupStagePositivePnlThresholdPct = 10;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    storage.modes.sandbox.tradeSettings[0].model_memory.positions = [position];
    delete storage.modes.sandbox.tradeSettings[0].model_memory.volatility;
    await slowTradingStorage.data.save(storage);

    const result = await slowTrading.service.runSlowTradingCycle({
      stage: "speedup",
    });
    const persisted = await slowTradingStorage.data.load({
      modeScope: "active",
    });
    const persistedPosition =
      persisted.modes.sandbox.tradeSettings[0].model_memory.positions?.[0];

    // PROD:SPEEDUP_STAGE_SHARED_VOLATILITY_CLASSIFICATION
    expect(productionMocks.assignVolatility).toHaveBeenCalledTimes(1);
    expect(result.symbols).toEqual(["SUI"]);
    expect(persistedPosition?.lastMonitoringStage).toMatchObject({
      reason: "post-average target approach",
      stage: "speedup",
    });
  });

  it("classifies a persisted position after its target vPoint", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { createTestPosition } = await import("../fixtures/position");
    const storage = slowTradingStorage.data.createDefault();
    const position = createTestPosition({
      direction: "SHORT",
      entryPrice: 100,
      entryTime: e2eSignal.t - 60_000,
      executionMode: "sandbox",
      pnl: {
        markPrice: 100,
        maxDownPct: 0,
        maxUpPct: 0,
        netPct: 0,
        netUsdt: 0,
      },
      symbol: "SUI",
    });

    storage.config.symbols = ["SUI"];
    storage.config.enableWatchLogic = false;
    storage.config.modelConfig.takeProfitPercent = 20;
    storage.config.modelConfig.useStopLossPlus = false;
    storage.runtime.autoEntryEnabled = false;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.runnerEnabled = true;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.speedupStageNegativePnlThresholdPct = 10;
    storage.runtime.speedupStagePositivePnlThresholdPct = 10;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    storage.modes.sandbox.tradeSettings[0].model_memory.positions = [position];
    delete storage.modes.sandbox.tradeSettings[0].model_memory.volatility;
    await slowTradingStorage.data.save(storage);

    const result = await slowTrading.service.runSlowTradingCycle({
      stage: "speedup",
    });
    const persisted = await slowTradingStorage.data.load({
      modeScope: "active",
    });
    const persistedPosition =
      persisted.modes.sandbox.tradeSettings[0].model_memory.positions?.[0];

    // PROD:SPEEDUP_STAGE_SHARED_VOLATILITY_CLASSIFICATION
    expect(result.symbols).toEqual(["SUI"]);
    expect(persistedPosition?.lastMonitoringStage).toMatchObject({
      reason: "target vPoint hit",
      stage: "speedup",
    });
  });

  it("does no market or private exchange I/O for empty monitoring", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const storage = slowTradingStorage.data.createDefault();
    const template = storage.runtime.exchangeAccounts[0];

    storage.config.symbols = ["SUI"];
    storage.runtime.runnerEnabled = true;
    await slowTradingStorage.data.save(storage);
    await slowTradingStorage.account.saveAccounts(
      [
        { ...template, slug: "alpha", name: "Alpha" },
        { ...template, slug: "beta", name: "Beta" },
      ],
      storage.sharedConfig,
    );

    await slowTrading.service.runSlowTradingCycle({ stage: "speedup" });

    // PROD:EMPTY_MONITORING_NO_MARKET_IO
    expect(productionMocks.assignVolatility).not.toHaveBeenCalled();
    expect(exchangeMocks.getKlines).not.toHaveBeenCalled();
    expect(exchangeMocks.getBalance).not.toHaveBeenCalled();
    expect(exchangeMocks.getPositions).not.toHaveBeenCalled();
  });

  it("removes a sandbox coin at the configured absolute level", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { FILES } = await import("@/components/storage");
    const { TradingMode } = await import("@/lib/exchange");

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.autoRemoveSymbolAbsLevel = 3;
    storage.runtime.sandboxInitialBalanceUSDT = 1_000;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    await slowTradingStorage.data.save(storage);
    await fs.outputJSON(`${FILES.slow.volatility("binance")}/SUI.json`, {
      lastVolatility: [e2eSignal],
      symbol: "SUI",
    });

    const result = await slowTrading.management.run();
    const persisted = await slowTradingStorage.data.load({ modeScope: "all" });

    // PROD:AUTO_REMOVE_COIN_ABOVE_SOME_ABS_LEVEL
    // PROD:MANAGEMENT_STAGE
    expect(result.removedSymbols).toEqual(["SUI"]);
    expect(persisted.config.symbols).toEqual([]);
  });

  it("removes a coin when any stored vpoint meets the pct threshold", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { FILES } = await import("@/components/storage");

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.runtime.sandboxEnabled = true;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoRemoveSymbolMinVPointPct = 15;
    await slowTradingStorage.data.save(storage);
    await fs.outputJSON(`${FILES.slow.volatility("binance")}/SUI.json`, {
      lastVolatility: [
        { ...e2eSignal, id: "old-spike", pct: 15, t: 1 },
        { ...e2eSignal, id: "latest-small", pct: 2, t: 2 },
      ],
      symbol: "SUI",
    });

    const result = await slowTrading.management.run();
    const persisted = await slowTradingStorage.data.load({ modeScope: "all" });
    const logs = await slowTradingStorage.logs.load();

    // PROD:AUTO_REMOVE_COIN_BY_VPOINT_PCT
    expect(result.removedSymbols).toEqual(["SUI"]);
    expect(persisted.config.symbols).toEqual([]);
    expect(logs.management).toEqual([
      expect.objectContaining({
        action: "remove",
        reason: "Stored vPoint old-spike movement 15% reached threshold 15%.",
        source:
          "slow-trading.sandbox-cycle.coin-management:auto-remove-vpoint-pct",
        symbol: "SUI",
      }),
    ]);
  });

  it("auto-removes an open-position coin while retaining its position", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.sandboxInitialBalanceUSDT = 1_000;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );
    await slowTradingStorage.data.save(storage);

    await slowTrading.service.runSlowTradingCycle({
      forceEntrySymbols: ["SUI"],
    });
    const withOpenPosition = await slowTradingStorage.data.load({
      modeScope: "all",
    });
    withOpenPosition.runtime.autoRemoveSymbolMinPrice = 101;
    await slowTradingStorage.data.save(withOpenPosition);

    await slowTrading.management.run();
    const persisted = await slowTradingStorage.data.load({ modeScope: "all" });
    const dashboard = slowTradingStorage.dashboard.buildState(persisted);

    // PROD:AUTO_REMOVE_COIN_WITH_OPEN_POSITION
    expect(persisted.config.symbols).toEqual([]);
    expect(
      persisted.modes.sandbox.tradeSettings.find(
        (item) => item.symbol === "SUI",
      )?.model_memory.positions,
    ).toHaveLength(1);
    expect(dashboard.openPositions).toEqual([
      expect.objectContaining({ symbol: "SUI" }),
    ]);
  });

  it("blocks and removes a sandbox coin below the management minimum price", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.autoRemoveSymbolMinPrice = 101;
    storage.runtime.sandboxInitialBalanceUSDT = 1_000;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );

    await slowTradingStorage.data.save(storage);

    const entryResult = await slowTrading.service.runSlowTradingCycle({
      forceEntrySymbols: ["SUI"],
    });
    const beforeManagement = await slowTradingStorage.data.load({
      modeScope: "all",
    });
    const managementResult = await slowTrading.management.run();
    const persisted = await slowTradingStorage.data.load({
      modeScope: "all",
    });
    const logs = await slowTradingStorage.logs.load();

    // BOTH:BLOCK_ENTRY_BELOW_AUTO_REMOVE_MIN_PRICE
    expect(entryResult.executedEntrySignals).toBe(0);
    expect(beforeManagement.config.symbols).toEqual(["SUI"]);
    // PROD:AUTO_REMOVE_COIN_BELOW_MIN_PRICE
    // PROD:MANAGEMENT_STAGE
    expect(managementResult.removedSymbols).toEqual(["SUI"]);
    expect(persisted.config.symbols).toEqual([]);
    expect(logs.management).toEqual([
      expect.objectContaining({
        action: "remove",
        reason: "Latest price 100 USDT fell below minimum 101 USDT.",
        source:
          "slow-trading.sandbox-cycle.coin-management:auto-remove-min-price",
        symbol: "SUI",
      }),
    ]);
  });

  it("removes a sandbox coin below the minimum market cap", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");

    marketCapMocks.getMap.mockResolvedValue({ SUI: 50_000_000 });
    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.autoRemoveSymbolMinMarketCapUSD = 100_000_000;
    storage.runtime.sandboxInitialBalanceUSDT = 1_000;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );

    await slowTradingStorage.data.save(storage);

    const result = await slowTrading.management.run();
    const persisted = await slowTradingStorage.data.load({ modeScope: "all" });
    const logs = await slowTradingStorage.logs.load();

    // PROD:AUTO_REMOVE_COIN_BELOW_MIN_MARKET_CAP
    expect(result.removedSymbols).toEqual(["SUI"]);
    expect(persisted.config.symbols).toEqual([]);
    expect(persisted.modes.sandbox.stageRuns?.management).toMatchObject({
      reports: 0,
      symbols: 1,
      summary: "sandbox management cycle removed 1 symbol(s)",
    });
    expect(logs.management).toEqual([
      expect.objectContaining({
        action: "remove",
        reason:
          "Latest market cap 50000000 USD fell below minimum 100000000 USD.",
        source:
          "slow-trading.sandbox-cycle.coin-management:auto-remove-market-cap",
        symbol: "SUI",
      }),
    ]);
  });

  it("removes a below-minimum coin from the live Symbols config", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI"];
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.sandboxEnabled = false;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.autoRemoveSymbolMinPrice = 101;
    storage.modes.live = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.live,
      storage.config.symbols,
    );

    await slowTradingStorage.data.save(storage);

    const result = await slowTrading.management.run();
    const persisted = await slowTradingStorage.data.load({ modeScope: "all" });
    const logs = await slowTradingStorage.logs.load();

    // PROD:AUTO_REMOVE_COIN_BELOW_MIN_PRICE
    expect(result.removedSymbols).toEqual(["SUI"]);
    expect(persisted.config.symbols).toEqual([]);
    // PROD:MANAGEMENT_LOG
    expect(logs.management).toEqual([
      expect.objectContaining({
        action: "remove",
        reason: "Latest price 100 USDT fell below minimum 101 USDT.",
        source: "slow-trading.live-cycle.coin-management:auto-remove-min-price",
        symbol: "SUI",
      }),
    ]);
    expect(notificationMocks.central).toHaveBeenCalledWith(
      expect.objectContaining({
        // PROD:NOTIF_MANAGEMENT_ACTION
        key: "NOTIF_MANAGEMENT_ACTION",
        title: "[MANAGEMENT] REMOVE SUI",
        message: expect.stringMatching(
          /Source: slow-trading\.live-cycle\.coin-management:auto-remove-min-price[\s\S]*Reason: Latest price 100 USDT fell below minimum 101 USDT\./,
        ),
      }),
    );
  });

  it("runs an 80-symbol persisted sandbox cycle through dashboard state", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = productionLikeSymbols;
    storage.config.exchangeType = "binance";
    storage.config.tradingMode = TradingMode.SPOT;
    storage.config.enableWatchLogic = false;
    storage.runtime.sandboxEnabled = true;
    storage.runtime.runnerEnabled = true;
    storage.runtime.autoEntryEnabled = true;
    storage.runtime.autoExitEnabled = false;
    storage.runtime.sandboxInitialBalanceUSDT = 1_000;
    storage.modes.sandbox = slowTradingStorage.mode.ensureTradeSettings(
      storage.modes.sandbox,
      storage.config.symbols,
    );

    await slowTradingStorage.data.save(storage);

    const result = await slowTrading.service.runSlowTradingCycle({
      forceEntrySymbols: ["SUI"],
    });
    const persisted = await slowTradingStorage.data.load({
      modeScope: "active",
    });
    const dashboard = slowTradingStorage.dashboard.buildState(persisted);

    // PROD:SLOW_LARGE_END_TO_END_CYCLE
    expect(storage.config.symbols).toHaveLength(80);
    expect(result.executedEntrySignals).toBe(1);
    expect(persisted.config.symbols).toHaveLength(80);
    expect(persisted.modes.sandbox.tradeSettings).toHaveLength(80);
    expect(dashboard.activeMode).toBe("sandbox");
    expect(dashboard.openPositions).toHaveLength(1);
    expect(dashboard.stats.lastRunSummary).toContain(
      "sandbox cycle finished with 1 report(s)",
    );
  });
});
