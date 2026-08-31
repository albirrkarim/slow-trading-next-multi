import type { EntryRecommendation } from "@/lib/brain";
import type { SlowTradingCyclePerformanceEntry } from "@/lib/slowTrading/performance";
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

const brainMocks = vi.hoisted(() => ({
  getInvestmentAmount: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  central: vi.fn(),
}));

const performanceSignal: EntryRecommendation = {
  amountProbab: 1,
  id: "SUI_performance_bottom",
  l: "B",
  lvl: -3,
  maxLeverage: 1,
  message: "performance entry",
  pct: -3,
  p: 100,
  symbol: "SUI",
  t: Date.UTC(2026, 0, 1, 0, 0),
} as EntryRecommendation;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createKline(t: number, p: number) {
  return [t, `${p}`, `${p}`, `${p}`, `${p}`, "100"] as any;
}

function sumDurationsBySection(entries: SlowTradingCyclePerformanceEntry[]) {
  return entries.reduce(
    (durations, entry) =>
      durations.set(
        entry.section,
        (durations.get(entry.section) ?? 0) + entry.durationMs,
      ),
    new Map<string, number>(),
  );
}

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
  const actual = await vi.importActual<any>("@/components/api/production/utils");

  return {
    ...actual,
    assignVolatility: vi.fn(async (modelMemoryMap: Record<string, any>) => {
      await delay(800);
      for (const symbol of Object.keys(modelMemoryMap)) {
        modelMemoryMap[symbol].volatility = {
          lastVolatility: symbol === "SUI" ? [{ ...performanceSignal }] : [],
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

let tmpRoot: string | null = null;

describe("slow cycle performance", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-cycle-perf-"));
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
    dynamicMocks.generateInitialPriceNorm.mockImplementation(
      async ({ dynamicTradeMemory }: any) => {
        await delay(5);
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

  it("records cycle section durations so the slowest leaf step is visible", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const slowTradingStorage = slowTrading.storage;
    const { TradingMode } = await import("@/lib/exchange");
    const entries: SlowTradingCyclePerformanceEntry[] = [];

    const storage = slowTradingStorage.data.createDefault();
    storage.config.symbols = ["SUI", "AKT", "HBAR"];
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
      stage: "capture-entry",
      performance: {
        onSection: (entry) => entries.push(entry),
      },
    });
    const persisted = await slowTradingStorage.data.load({
      modeScope: "active",
    });
    const dashboard = slowTradingStorage.dashboard.buildState(persisted);
    const durations = sumDurationsBySection(entries);
    const leafDurations = [...durations.entries()].filter(
      ([section]) => section !== "cycle.total" && section !== "signals.build",
    );
    const slowestLeaf = leafDurations.sort((left, right) => right[1] - left[1])
      .at(0);

    // PROD:CYCLE_PERFORMANCE_SECTION_DURATION
    expect(result.executedEntrySignals).toBe(1);
    expect(durations.get("signals.build")).toBeGreaterThanOrEqual(800);
    expect(durations.get("signals.assignVolatility")).toBeGreaterThanOrEqual(
      750,
    );
    expect(durations.has("cycle.priceNorm")).toBe(true);
    expect(durations.has("cycle.entryExecution")).toBe(true);
    expect(durations.has("cycle.cachePersist")).toBe(true);
    expect(durations.has("cycle.modeStatePersist")).toBe(true);
    expect(
      dashboard.stats.lastRunPerformance?.sections.some(
        (section) => section.s === "signals.assignVolatility",
      ),
    ).toBe(true);
    expect(
      dashboard.stats.lastRunPerformance?.sections.some(
        (section) => section.s === "cycle.modeStatePersist",
      ),
    ).toBe(true);
    expect(
      dashboard.stats.stageRuns["capture-entry"]?.performance.sections.some(
        (section) => section.s === "signals.assignVolatility",
      ),
    ).toBe(true);
    expect(dashboard.stats.stageRuns["capture-entry"]?.symbols).toBe(3);
    expect(dashboard.stats.stageRuns["capture-entry"]?.reports).toBe(1);
    expect(slowestLeaf).toEqual([
      "signals.assignVolatility",
      expect.any(Number),
    ]);
  });
});
