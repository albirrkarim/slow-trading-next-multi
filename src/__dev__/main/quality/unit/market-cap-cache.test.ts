import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.get,
  },
}));

let tmpRoot: string | null = null;

describe("market-cap cache", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "market-cap-cache-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    process.env.COINMARKETCAP_API_KEY = "test-key";
    vi.resetModules();
    vi.useFakeTimers();
    mocks.get.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }
    delete process.env.PERSISTENT_STORAGE_ROOT;
    delete process.env.COINMARKETCAP_API_KEY;
    vi.resetModules();
  });

  it("refreshes a successful market cap after one day", async () => {
    const start = Date.UTC(2026, 7, 1, 0, 0);
    vi.setSystemTime(start);
    mocks.get
      .mockResolvedValueOnce({
        data: {
          data: { SUI: { quote: { USD: { market_cap: 50_000_000 } } } },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: { SUI: { quote: { USD: { market_cap: 60_000_000 } } } },
        },
      });
    const {
      getMarketCapFetchedAtMapForSymbols,
      getMarketCapUSDForSymbol,
    } = await import("@/lib/exchange/market-cap");

    // PROD:MARKET_CAP_CACHE_ONE_DAY
    await expect(getMarketCapUSDForSymbol("SUI", false)).resolves.toBe(
      50_000_000,
    );
    await expect(
      getMarketCapFetchedAtMapForSymbols(["SUI"]),
    ).resolves.toEqual({ SUI: start });
    vi.setSystemTime(start + 23 * 60 * 60 * 1000);
    await expect(getMarketCapUSDForSymbol("SUI", false)).resolves.toBe(
      50_000_000,
    );
    expect(mocks.get).toHaveBeenCalledTimes(1);

    vi.setSystemTime(start + 25 * 60 * 60 * 1000);
    await expect(getMarketCapUSDForSymbol("SUI", false)).resolves.toBe(
      60_000_000,
    );
    await expect(
      getMarketCapFetchedAtMapForSymbols(["SUI"]),
    ).resolves.toEqual({ SUI: start + 25 * 60 * 60 * 1000 });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
