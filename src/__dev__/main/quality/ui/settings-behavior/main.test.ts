import slowTradingAutoRemoveSymbols from "@/lib/slowTrading/auto-remove-symbols";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, vi } from "vitest";
import { createTestPosition } from "../../fixtures/position";

let tmpRoot: string | null = null;

function memoryWithLevel(level: number) {
  return {
    positions: [],
    volatility: {
      lastVolatility: [
        {
          id: `point-${level}`,
          l: level >= 0 ? "T" : "B",
          lvl: level,
          p: 1,
          pct: Math.abs(level),
          t: 1,
          vb: 1,
          vq: 1,
        },
      ],
    },
  };
}

describe("settings behavior: main trading config", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-settings-main-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
  });

  afterEach(async () => {
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }

    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.resetModules();
  });

  it("keeps autoRemoveSymbolAbsLevel disabled at 0", () => {
    expect(
      slowTradingAutoRemoveSymbols.find.byAbsLevel({
        configuredSymbols: ["SUI", "AAVE"],
        thresholdAbsLevel: 0,
        modelMemoryMap: {
          AAVE: memoryWithLevel(-8),
          SUI: memoryWithLevel(7),
        },
      }),
    ).toEqual([]);
  });

  it("finds configured symbols whose latest vpoint reaches the absolute level", () => {
    const removable = slowTradingAutoRemoveSymbols.find.byAbsLevel({
      configuredSymbols: ["sui", "AAVE", "BTC", "SUI"],
      thresholdAbsLevel: 6,
      modelMemoryMap: {
        AAVE: memoryWithLevel(-6),
        BTC: memoryWithLevel(5),
        SUI: memoryWithLevel(7),
      },
    });

    expect(removable).toEqual(["SUI", "AAVE"]);
    expect(
      slowTradingAutoRemoveSymbols.remove.fromConfig(
        ["sui", "AAVE", "BTC"],
        removable,
      ),
    ).toEqual(["BTC"]);
  });

  it("finds every matching symbol without requiring position state", () => {
    expect(
      slowTradingAutoRemoveSymbols.find.byAbsLevel({
        configuredSymbols: ["SUI", "AAVE"],
        thresholdAbsLevel: 6,
        modelMemoryMap: {
          AAVE: memoryWithLevel(-6),
          SUI: memoryWithLevel(7),
        },
      }),
    ).toEqual(["SUI", "AAVE"]);
  });

  it("removes and blocks only prices strictly below the configured minimum", () => {
    const removable = slowTradingAutoRemoveSymbols.find.byMinPrice({
      configuredSymbols: ["iotx", "FOLKS", "SUI", "AAVE"],
      latestPriceBySymbol: {
        AAVE: 0.001,
        FOLKS: 0.01,
        IOTX: 0.009,
      },
      minimumPrice: 0.01,
    });

    expect(removable).toEqual(["IOTX", "AAVE"]);
    expect(
      slowTradingAutoRemoveSymbols.price.isBelowMinimum({
        price: 0.009,
        minimumPrice: 0.01,
      }),
    ).toBe(true);
    expect(
      slowTradingAutoRemoveSymbols.price.isBelowMinimum({
        price: 0.01,
        minimumPrice: 0.01,
      }),
    ).toBe(false);
    expect(
      slowTradingAutoRemoveSymbols.price.isBelowMinimum({
        price: 0.009,
        minimumPrice: 0,
      }),
    ).toBe(false);
  });

  it("finds only known market caps strictly below the configured minimum", () => {
    const removable = slowTradingAutoRemoveSymbols.find.byMarketCap({
      configuredSymbols: ["SUI", "AAVE", "IOTX", "UNKNOWN"],
      marketCapUSDBySymbol: {
        AAVE: 100_000_000,
        IOTX: 20_000_000,
        SUI: 99_999_999,
      },
      minimumMarketCapUSD: 100_000_000,
    });

    // PROD:AUTO_REMOVE_COIN_BELOW_MIN_MARKET_CAP
    expect(removable).toEqual(["SUI", "IOTX"]);
    expect(
      slowTradingAutoRemoveSymbols.find.byMarketCap({
        configuredSymbols: ["SUI"],
        marketCapUSDBySymbol: { SUI: 1 },
        minimumMarketCapUSD: 0,
      }),
    ).toEqual([]);
  });

  it("checks every stored vpoint and removes at an inclusive pct threshold", () => {
    const historicalSpike = {
      id: "point-old-spike",
      l: "T" as const,
      lvl: 1,
      p: 1.2,
      pct: 15,
      t: 1,
      vb: 1,
      vq: 1,
    };
    const latestSmallMove = {
      ...historicalSpike,
      id: "point-latest-small",
      pct: 2,
      t: 2,
    };

    // PROD:AUTO_REMOVE_COIN_BY_VPOINT_PCT
    expect(
      slowTradingAutoRemoveSymbols.find.byVPointPct({
        configuredSymbols: ["SUI", "AAVE"],
        minimumVPointPct: 15,
        volatilityPointsBySymbol: {
          SUI: [historicalSpike, latestSmallMove],
          AAVE: [{ ...historicalSpike, id: "aave", pct: 14.99 }],
        },
      }),
    ).toEqual(["SUI"]);
    expect(
      slowTradingAutoRemoveSymbols.find.byVPointPct({
        configuredSymbols: ["SUI"],
        minimumVPointPct: 0,
        volatilityPointsBySymbol: { SUI: [historicalSpike] },
      }),
    ).toEqual([]);
  });

  it("keeps an open position managed when its coin is removed from trade config", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();

    storage.config.symbols = ["SUI", "AAVE"];
    storage.modes.live = slowTrading.storage.mode.ensureTradeSettings(
      storage.modes.live,
      storage.config.symbols,
    );
    storage.modes.live.dynamicTradeMemory.reservedQuoteAsset = 40;
    storage.modes.live.tradeSettings.find(
      (item) => item.symbol === "SUI",
    )!.model_memory.positions = [
      createTestPosition({
        direction: "LONG",
        entryPrice: 10,
        entryTime: Date.UTC(2026, 0, 1),
        executionMode: "live",
        marginUsdt: 25,
        notionalUsdt: 25,
        quantity: 2.5,
        symbol: "SUI",
      }),
    ];

    await slowTrading.storage.data.save(storage);
    await slowTrading.storage.data.update({ symbols: ["AAVE"] });

    const loaded = await slowTrading.storage.data.load();
    const dashboard = slowTrading.storage.dashboard.buildState(loaded);
    const suiSetting = loaded.modes.live.tradeSettings.find(
      (item) => item.symbol === "SUI",
    );

    expect(loaded.config.symbols).toEqual(["AAVE"]);
    expect(suiSetting?.model_memory.positions).toHaveLength(1);
    expect(dashboard.openPositions.map((position) => position.symbol)).toEqual([
      "SUI",
    ]);
    expect(dashboard.balances.reservedQuoteAsset).toBe(40);
    expect(dashboard.balances.lockedQuoteAsset).toBe(25);
  });
});
