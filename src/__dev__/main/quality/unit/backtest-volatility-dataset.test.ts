import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_ROOT = "/tmp/slow-backtest-volatility-dataset";
const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
  fetchKlines: vi.fn(),
}));

vi.mock("@/components/api/constants", () => ({
  VOLATILITY_FOLDER: "/tmp/slow-backtest-volatility-dataset",
}));

vi.mock("@/lib/datasets/fetchKlines", () => ({
  fetchKlinesFunction: mocks.fetchKlines,
}));

vi.mock("@/lib/dynamic", () => ({
  detectVolatilityPoints: mocks.detect,
}));

import volatilityDataset from "@/lib/devBacktest/volatility-dataset";

const points = [
  { id: "a", lvl: 1, p: 10, symbol: "AKT", t: 100 },
  { id: "b", lvl: 0, p: 9, symbol: "AKT", t: 200 },
] as any[];

describe("backtest volatility dataset", () => {
  beforeEach(async () => {
    await fs.remove(TEST_ROOT);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_ROOT);
  });

  it("reuses a compatible compact volatility file without fetching klines", async () => {
    const paths = volatilityDataset.paths.get("binance", "6month", "AKT");
    await fs.ensureDir(paths.data.replace(/\/AKT\.json$/, ""));
    await fs.writeJson(paths.data, points);
    await fs.ensureDir(paths.metadata.replace(/\/AKT\.json$/, ""));
    await fs.writeJson(paths.metadata, {
      interval: "5m",
      marketType: "FUTURES",
    });

    const result = await volatilityDataset.load({
      exchangeType: "binance",
      interval: "5m",
      marketType: "FUTURES",
      range: "6month",
      symbols: ["AKT"],
      useCache: true,
    });

    // BTEST:BACKTEST_VOLATILITY_DATASET
    expect(result.volatilityMap.AKT).toEqual(points);
    expect(mocks.fetchKlines).not.toHaveBeenCalled();
  });

  it("creates only compact volatility data when the cache is missing", async () => {
    mocks.fetchKlines.mockResolvedValue([
      [100, "10", "10", "10", "10", "1"],
      [200, "9", "9", "9", "9", "1"],
    ]);
    mocks.detect.mockReturnValue(points);

    const result = await volatilityDataset.load({
      exchangeType: "binance",
      interval: "5m",
      marketType: "FUTURES",
      range: "6month",
      symbols: ["AKT"],
      useCache: true,
    });
    const paths = volatilityDataset.paths.get("binance", "6month", "AKT");

    // BTEST:BACKTEST_VOLATILITY_DATASET
    expect(result.volatilityMap.AKT).toEqual(points);
    expect(await fs.pathExists(paths.data)).toBe(true);
    expect(await fs.pathExists(paths.metadata)).toBe(true);
    expect(await fs.pathExists(`${TEST_ROOT}/KLINES`)).toBe(false);
    expect(await fs.pathExists(`${TEST_ROOT}/COMMON_TIME`)).toBe(false);
  });
});
