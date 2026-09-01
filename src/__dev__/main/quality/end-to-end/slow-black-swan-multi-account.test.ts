import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeMocks = vi.hoisted(() => ({
  getKlines: vi.fn(),
}));

vi.mock("@/lib/exchange/adapters/binance", () => ({
  BinanceAdapter: class {
    getKlines = exchangeMocks.getKlines;
  },
}));

vi.mock("@/lib/notification", async () => {
  const actual = await vi.importActual<any>("@/lib/notification");
  return {
    ...actual,
    notif: { central: vi.fn() },
  };
});

let tmpRoot: string | null = null;

function createKlines(currentTimeMs: number) {
  return Array.from({ length: 66 }, (_, index) => {
    const t = currentTimeMs - (65 - index) * 60_000;
    return [t, "100", "100", "100", "100", "100"] as any;
  });
}

describe("SLOW multi-account Black Swan evidence", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-black-swan-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.clearAllMocks();
    exchangeMocks.getKlines.mockImplementation(async () =>
      createKlines(Date.now()),
    );
  });

  afterEach(async () => {
    if (tmpRoot) await fs.remove(tmpRoot);
    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.resetModules();
  });

  it("captures BTC once and fans the evidence out to account state", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const storage = slowTrading.storage.data.createDefault();
    const template = storage.runtime.exchangeAccounts[0];
    storage.config.blackSwan!.enabled = true;
    storage.sharedConfig.blackSwan!.enabled = true;
    await slowTrading.storage.data.save(storage);
    await slowTrading.storage.account.saveAccounts(
      [
        { ...template, slug: "alpha", name: "Alpha" },
        { ...template, slug: "beta", name: "Beta" },
      ],
      storage.sharedConfig,
    );

    const representative = await slowTrading.storage.data.load({
      account: "alpha",
      modeScope: "active",
    });
    const evidence = await slowTrading.blackSwan.evidence.capture({
      storage: representative,
    });
    const alphaResult = await slowTrading.blackSwan.account.apply({
      account: "alpha",
      evidence,
    });
    const betaResult = await slowTrading.blackSwan.account.apply({
      account: "beta",
      evidence,
    });
    const alpha = await slowTrading.storage.data.load({ account: "alpha" });
    const beta = await slowTrading.storage.data.load({ account: "beta" });

    // PROD:BLACK_SWAN_SHARED_EVIDENCE
    expect(exchangeMocks.getKlines).toHaveBeenCalledTimes(1);
    // PROD:BLACK_SWAN_ACCOUNT_STATE_FAN_OUT
    expect(alphaResult.next.t).toBe(evidence.capturedAtMs);
    expect(betaResult.next.t).toBe(evidence.capturedAtMs);
    expect(alpha.modes.live.blackSwan?.t).toBe(evidence.capturedAtMs);
    expect(beta.modes.live.blackSwan?.t).toBe(evidence.capturedAtMs);
  });
});
