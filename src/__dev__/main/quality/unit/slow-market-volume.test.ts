import slowTrading from "@/lib/slowTrading";
import type { UnifiedTicker } from "@/lib/exchange/types";
import fs from "fs-extra";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTickers: vi.fn(),
  root: `/tmp/slow-market-volume-${process.pid}`,
}));

vi.mock("@/lib/exchange", () => ({
  getExchange: () => ({ getTickers: mocks.getTickers }),
}));

vi.mock("@/lib/persistent-storage-root", () => ({
  resolvePersistentStorageRoot: () => mocks.root,
}));

function ticker(coin: string, volume: number): UnifiedTicker {
  return {
    changePercent: 0,
    coin,
    exchange: "binance",
    high24h: 1,
    lastPrice: 1,
    low24h: 1,
    marketCap: 0,
    open24h: 1,
    symbol: `${coin}USDT`,
    volume,
  };
}

describe("SLOW 24-hour market volume", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.remove(mocks.root);
  });

  afterAll(async () => {
    await fs.remove(mocks.root);
  });

  it("fetches the configured futures ticker batch and persists requested coins", async () => {
    mocks.getTickers.mockResolvedValue([
      ticker("SOL", 125_000_000),
      ticker("ETH", 800_000_000),
      ticker("BTC", 2_000_000_000),
    ]);

    const snapshot = await slowTrading.marketVolume.snapshot.refresh({
      exchangeType: "binance",
      marketType: "FUTURES",
      symbols: ["SOL", "ETH_USDT"],
    });

    // PROD:LATEST_VOLATILITY_VOLUME_24H
    expect(mocks.getTickers).toHaveBeenCalledWith({
      containSymbol: "USDT",
      marketType: "FUTURES",
    });
    expect(snapshot.volumes).toEqual({
      ETH: 800_000_000,
      SOL: 125_000_000,
    });
    const file = path.join(
      mocks.root,
      "slow/binance/ticker-24h-futures.json",
    );
    const saved = await fs.readFile(file, "utf8");
    expect(saved).toBe(JSON.stringify(snapshot));
    expect(
      await slowTrading.marketVolume.snapshot.read("binance", "FUTURES"),
    ).toEqual(snapshot);
  });

  it("ignores missing, invalid, and unrequested ticker volumes", () => {
    const invalid = ticker("BAD", Number.NaN);

    expect(
      slowTrading.marketVolume.map.build(
        ["SOL", "BAD"],
        [ticker("SOL", 10), invalid, ticker("ETH", 20)],
      ),
    ).toEqual({ SOL: 10 });
  });
});
