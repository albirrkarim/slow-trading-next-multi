import type * as ExchangeModule from "@/lib/exchange";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpRoot: string | null = null;

describe("manual live balance refresh", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-balance-refresh-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    vi.doUnmock("@/lib/exchange");
    if (tmpRoot) {
      await fs.remove(tmpRoot);
    }
    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.resetModules();
  });

  it("fetches and persists one selected live account balance", async () => {
    const getBalance = vi.fn().mockResolvedValue({
      baseAsset: 0,
      quoteAsset: 250,
    });
    vi.doMock("@/lib/exchange", async (importOriginal) => ({
      ...(await importOriginal<typeof ExchangeModule>()),
      getExchange: () => ({ getBalance }),
    }));

    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.sandboxEnabled = false;
    storage.modes.live.dynamicTradeMemory.quoteAsset = 100;
    storage.modes.live.dynamicTradeMemory.safeHaven = 25;
    storage.modes.live.dynamicTradeMemory.startingBalanceUSDT = 0;
    await slowTrading.storage.data.save(storage);

    const result = await slowTrading.balance.live.refreshAccount(
      storage.account.slug,
    );
    const persisted = await slowTrading.storage.data.load({
      account: storage.account.slug,
      modeScope: "active",
    });

    // PROD:MANUAL_ACCOUNT_BALANCE_REFRESH
    expect(getBalance).toHaveBeenCalledOnce();
    expect(getBalance).toHaveBeenCalledWith("USDT_USDT");
    expect(result).toMatchObject({
      account: storage.account.slug,
      availableQuoteAsset: 250,
    });
    expect(persisted.modes.live.dynamicTradeMemory).toMatchObject({
      quoteAsset: 225,
      safeHaven: 25,
      startingBalanceUSDT: 225,
    });
  });

  it("does not call the exchange for a sandbox account", async () => {
    const getBalance = vi.fn();
    vi.doMock("@/lib/exchange", async (importOriginal) => ({
      ...(await importOriginal<typeof ExchangeModule>()),
      getExchange: () => ({ getBalance }),
    }));

    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    storage.runtime.sandboxEnabled = true;
    await slowTrading.storage.data.save(storage);

    await expect(
      slowTrading.balance.live.refreshAccount(storage.account.slug),
    ).rejects.toThrow("sandbox mode");
    expect(getBalance).not.toHaveBeenCalled();
  });
});
