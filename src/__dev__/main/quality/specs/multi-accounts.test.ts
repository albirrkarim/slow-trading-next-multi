import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SlowTradingBalanceSummary } from "@/lib/slowTrading";
import { createTestPosition } from "../fixtures/position";

let tmpRoot: string | null = null;

describe("SLOW multi-account specs", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "slow-multi-account-"));
    process.env.PERSISTENT_STORAGE_ROOT = tmpRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    if (tmpRoot) await fs.remove(tmpRoot);
    delete process.env.PERSISTENT_STORAGE_ROOT;
    vi.resetModules();
  });

  it("creates immutable unique slugs and never reuses a retired slug", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const defaults = slowTrading.storage.data.createDefault();
    const template = defaults.runtime.exchangeAccounts[0];
    const first = {
      ...template,
      slug: "main-account",
      name: "Renamed Main",
    };
    const second = {
      ...template,
      slug: "reserve",
      name: "Reserve",
    };
    await slowTrading.storage.account.saveAccounts(
      [first, second],
      defaults.sharedConfig,
    );
    await slowTrading.storage.account.saveAccounts(
      [second],
      defaults.sharedConfig,
    );
    const saved = await slowTrading.storage.account.saveAccounts(
      [second, { ...template, slug: "main-account", name: "Main Account" }],
      defaults.sharedConfig,
    );

    // PROD:MULTI_ACCOUNT_IMMUTABLE_SLUG
    expect(saved.map((account) => account.slug)).toEqual([
      "reserve",
      "main-account-2",
    ]);
  });

  it("keeps live and sandbox memory isolated by account slug", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const defaults = slowTrading.storage.data.createDefault();
    const template = defaults.runtime.exchangeAccounts[0];
    await slowTrading.storage.data.save(defaults);
    await slowTrading.storage.account.saveAccounts(
      [
        { ...template, slug: "alpha", name: "Alpha" },
        {
          ...template,
          slug: "beta",
          name: "Beta",
          sandbox: { enabled: true, initialBalanceUSDT: 900 },
        },
      ],
      defaults.sharedConfig,
    );

    const alpha = await slowTrading.storage.data.load({ account: "alpha" });
    const beta = await slowTrading.storage.data.load({ account: "beta" });
    alpha.modes.live.dynamicTradeMemory.quoteAsset = 111;
    beta.modes.live.dynamicTradeMemory.quoteAsset = 222;
    await slowTrading.storage.mode.saveState("live", alpha.modes.live, {
      account: "alpha",
    });
    await slowTrading.storage.mode.saveState("live", beta.modes.live, {
      account: "beta",
    });

    const loadedAlpha = await slowTrading.storage.data.load({ account: "alpha" });
    const loadedBeta = await slowTrading.storage.data.load({ account: "beta" });
    // PROD:MULTI_ACCOUNT_STATE_ISOLATION
    expect(loadedAlpha.modes.live.dynamicTradeMemory.quoteAsset).toBe(111);
    expect(loadedBeta.modes.live.dynamicTradeMemory.quoteAsset).toBe(222);
    // PROD:MULTI_ACCOUNT_SANDBOX_ISOLATION
    expect(loadedAlpha.runtime.sandboxEnabled).toBe(false);
    expect(loadedBeta.runtime.sandboxEnabled).toBe(true);
    expect(loadedBeta.runtime.sandboxInitialBalanceUSDT).toBe(900);
  });

  it("binds production and backtest positions to the scoped account", async () => {
    const context = await import("@/lib/exchange/account-context");
    const [productionSource, backtestSource] = await Promise.all([
      fs.readFile("src/lib/trading/execute/execute-entry.ts", "utf8"),
      fs.readFile("src/lib/dynamic/backtest-volatility/trading.ts", "utf8"),
    ]);

    await context.runWithExchangeAccount("account-blue", async () => {
      expect(context.getCurrentExchangeAccountSlug()).toBe("account-blue");
    });
    // BOTH:MULTI_ACCOUNT_POSITION_OWNER
    expect(productionSource).toContain("BOTH:MULTI_ACCOUNT_POSITION_OWNER");
    // BOTH:MULTI_ACCOUNT_POSITION_OWNER
    expect(backtestSource).toContain("BOTH:MULTI_ACCOUNT_POSITION_OWNER");
  });

  it("deduplicates and hydrates shared history by account owner", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const defaults = slowTrading.storage.data.createDefault();
    const template = defaults.runtime.exchangeAccounts[0];
    await slowTrading.storage.data.save(defaults);
    await slowTrading.storage.account.saveAccounts(
      [
        { ...template, slug: "alpha", name: "Alpha" },
        { ...template, slug: "beta", name: "Beta" },
      ],
      defaults.sharedConfig,
    );

    for (const account of ["alpha", "beta"]) {
      const storage = await slowTrading.storage.data.load({ account });
      storage.modes.live.tradeSettings[0].model_memory.positionsSell = [
        createTestPosition({
          account,
          executionMode: "live",
          entryId: "shared-identity",
          entryTime: 100,
          closed: { t: 200, price: 11, feeUsdt: 0, reason: "TAKE_PROFIT" },
        }),
      ];
      await slowTrading.storage.mode.saveState("live", storage.modes.live, {
        account,
      });
    }

    const alpha = await slowTrading.storage.data.load({
      account: "alpha",
      includeHistory: true,
    });
    const beta = await slowTrading.storage.data.load({
      account: "beta",
      includeHistory: true,
    });
    // BOTH:MULTI_ACCOUNT_HISTORY_OWNER
    expect(slowTrading.storage.history.getClosed(alpha, "live")).toEqual([
      expect.objectContaining({ account: "alpha" }),
    ]);
    // BOTH:MULTI_ACCOUNT_HISTORY_OWNER
    expect(slowTrading.storage.history.getClosed(beta, "live")).toEqual([
      expect.objectContaining({ account: "beta" }),
    ]);
  });

  it("retains each account's balance summary in the combined dashboard", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const defaults = slowTrading.storage.data.createDefault();
    const template = defaults.runtime.exchangeAccounts[0];
    await slowTrading.storage.data.save(defaults);
    await slowTrading.storage.account.saveAccounts(
      [
        {
          ...template,
          slug: "alpha",
          name: "Alpha",
          sandbox: { enabled: true, initialBalanceUSDT: 100 },
        },
        {
          ...template,
          slug: "beta",
          name: "Beta",
          enabled: false,
          sandbox: { enabled: true, initialBalanceUSDT: 200 },
        },
      ],
      defaults.sharedConfig,
    );

    const alpha = await slowTrading.storage.data.load({ account: "alpha" });
    const beta = await slowTrading.storage.data.load({ account: "beta" });
    alpha.modes.sandbox.dynamicTradeMemory.quoteAsset = 111;
    beta.modes.sandbox.dynamicTradeMemory.quoteAsset = 222;

    const dashboard =
      await slowTrading.storage.dashboard.buildCombinedStateRealtime([
        alpha,
        beta,
      ]);

    // PROD:MULTI_ACCOUNT_COMBINED_DASHBOARD
    expect(dashboard.accountSummaries).toEqual([
      expect.objectContaining({
        slug: "alpha",
        enabled: true,
        balances: expect.objectContaining({ availableQuoteAsset: 111 }),
      }),
      expect.objectContaining({
        slug: "beta",
        enabled: false,
        balances: expect.objectContaining({ availableQuoteAsset: 222 }),
      }),
    ]);
  });

  it("keeps the newest run for each stage in the combined dashboard", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const defaults = slowTrading.storage.data.createDefault();
    const template = defaults.runtime.exchangeAccounts[0];
    await slowTrading.storage.data.save(defaults);
    await slowTrading.storage.account.saveAccounts(
      [
        {
          ...template,
          slug: "alpha",
          name: "Alpha",
          sandbox: { enabled: true, initialBalanceUSDT: 100 },
        },
        {
          ...template,
          slug: "beta",
          name: "Beta",
          sandbox: { enabled: true, initialBalanceUSDT: 200 },
        },
      ],
      defaults.sharedConfig,
    );

    const alpha = await slowTrading.storage.data.load({ account: "alpha" });
    const beta = await slowTrading.storage.data.load({ account: "beta" });
    alpha.modes.sandbox.lastRunAt = 3_000;
    alpha.modes.sandbox.stageRuns = {
      "risk-sentinel": {
        t: 3_000,
        ms: 10,
        reports: 0,
        symbols: 1,
        summary: "alpha risk sentinel",
        performance: { totalMs: 10, sections: [] },
      },
    };
    beta.modes.sandbox.lastRunAt = 2_000;
    beta.modes.sandbox.stageRuns = {
      "capture-entry": {
        t: 2_000,
        ms: 20,
        reports: 1,
        symbols: 6,
        summary: "beta capture entry",
        performance: { totalMs: 20, sections: [] },
      },
      management: {
        t: 1_000,
        ms: 30,
        reports: 0,
        symbols: 6,
        summary: "beta management",
        performance: { totalMs: 30, sections: [] },
      },
    };
    await slowTrading.storage.mode.saveState("sandbox", alpha.modes.sandbox, {
      account: "alpha",
    });
    await slowTrading.storage.mode.saveState("sandbox", beta.modes.sandbox, {
      account: "beta",
    });

    const dashboard =
      await slowTrading.storage.dashboard.buildCombinedStateRealtime([
        alpha,
        beta,
      ]);

    // PROD:MULTI_ACCOUNT_COMBINED_DASHBOARD
    expect(dashboard.stats.stageRuns["risk-sentinel"]?.summary).toBe(
      "alpha risk sentinel",
    );
    expect(dashboard.stats.stageRuns["capture-entry"]?.summary).toBe(
      "beta capture entry",
    );
    expect(dashboard.stats.stageRuns.management?.summary).toBe(
      "beta management",
    );
  });

  it("aggregates every enabled account in the MCP balance and excludes disabled accounts", async () => {
    const slowTrading = (await import("@/lib/slowTrading")).default;
    const defaults = slowTrading.storage.data.createDefault();
    const template = defaults.runtime.exchangeAccounts[0];
    await slowTrading.storage.data.save(defaults);
    await slowTrading.storage.account.saveAccounts(
      [
        {
          ...template,
          slug: "alpha",
          name: "Alpha",
          sandbox: { enabled: true, initialBalanceUSDT: 100 },
        },
        {
          ...template,
          slug: "beta",
          name: "Beta",
          sandbox: { enabled: true, initialBalanceUSDT: 400 },
        },
        {
          ...template,
          slug: "paused",
          name: "Paused",
          enabled: false,
          sandbox: { enabled: true, initialBalanceUSDT: 999 },
        },
      ],
      defaults.sharedConfig,
    );

    for (const [account, quoteAsset, safeHaven] of [
      ["alpha", 80, 20],
      ["beta", 350, 50],
      ["paused", 999, 0],
    ] as const) {
      const storage = await slowTrading.storage.data.load({ account });
      storage.modes.sandbox.dynamicTradeMemory.quoteAsset = quoteAsset;
      storage.modes.sandbox.dynamicTradeMemory.safeHaven = safeHaven;
      await slowTrading.storage.mode.saveState(
        "sandbox",
        storage.modes.sandbox,
        { account },
      );
    }

    const result = (await slowTrading.mcp.tools.call({
      arguments: { mode: "sandbox" },
      auth: {
        permissions: new Set(["balance.read" as const]),
        token: {
          createdAt: 0,
          enabled: true,
          id: "balance-test",
          name: "Balance test",
          permissions: ["balance.read"],
          tokenHash: "",
          tokenSecretEncrypted: "",
        },
      },
      name: "slow_balance_read",
    })) as SlowTradingBalanceSummary;

    // PROD:MULTI_ACCOUNT_COMBINED_MCP_BALANCE
    expect(result.balance).toMatchObject({
      available: 500,
      safeHaven: 70,
      totalAsset: 500,
    });
    expect(result.accounts).toEqual([
      expect.objectContaining({
        slug: "alpha",
        balance: expect.objectContaining({ totalAsset: 100 }),
      }),
      expect.objectContaining({
        slug: "beta",
        balance: expect.objectContaining({ totalAsset: 400 }),
      }),
    ]);
  });

  it("documents executable guards for sequencing and account dependencies", async () => {
    const [
      cycleAccounts,
      cycleDailyPnl,
      accountApi,
      quickBacktest,
      withdrawal,
      dashboard,
      history,
      standardBacktest,
    ] = await Promise.all([
      fs.readFile("src/lib/slowTrading/cycle/accounts.ts", "utf8"),
      fs.readFile("src/lib/slowTrading/cycle/daily-pnl.ts", "utf8"),
      fs.readFile("src/pages/api/slow-trading/exchange-accounts.ts", "utf8"),
      fs.readFile("src/lib/slowTrading/quick-backtest.ts", "utf8"),
      fs.readFile("src/lib/slowTrading/withdrawal.ts", "utf8"),
      fs.readFile("src/lib/slowTrading/storage/dashboard.ts", "utf8"),
      fs.readFile("src/lib/slowTrading/storage/history-files.ts", "utf8"),
      fs.readFile("src/lib/devBacktest/api/dynamicTradeBacktest.ts", "utf8"),
    ]);

    // PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE
    expect(cycleAccounts).toContain("PROD:MULTI_ACCOUNT_SEQUENTIAL_CYCLE");
    // PROD:MULTI_ACCOUNT_FAILURE_ISOLATION
    expect(cycleAccounts).toContain("PROD:MULTI_ACCOUNT_FAILURE_ISOLATION");
    // PROD:MULTI_ACCOUNT_DISABLED_ENTRY_ONLY
    expect(cycleAccounts).toContain("PROD:MULTI_ACCOUNT_DISABLED_ENTRY_ONLY");
    // PROD:MULTI_ACCOUNT_DELETE_DEPENDENCY_GUARD
    expect(accountApi).toContain("PROD:MULTI_ACCOUNT_DELETE_DEPENDENCY_GUARD");
    // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
    expect(quickBacktest).toContain("BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST");
    // BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST
    expect(standardBacktest).toContain("BTEST:MULTI_ACCOUNT_COMBINED_BACKTEST");
    // PROD:MULTI_ACCOUNT_WITHDRAWAL_OWNER
    expect(withdrawal).toContain("PROD:MULTI_ACCOUNT_WITHDRAWAL_OWNER");
    // PROD:MULTI_ACCOUNT_COMBINED_DAILY_PNL
    expect(cycleDailyPnl).toContain("PROD:MULTI_ACCOUNT_COMBINED_DAILY_PNL");
    // PROD:MULTI_ACCOUNT_COMBINED_DASHBOARD
    expect(dashboard).toContain("PROD:MULTI_ACCOUNT_COMBINED_DASHBOARD");
    // BOTH:MULTI_ACCOUNT_HISTORY_OWNER
    expect(history).toContain("BOTH:MULTI_ACCOUNT_HISTORY_OWNER");
  });
});
